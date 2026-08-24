import { Router, type RequestHandler, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { crudRouteHandler, sendData, sendCreated } from './routeUtils.js';
import { authConfig, config } from '../config/index.js';
import {
  generateToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  jwtAuth,
  hashUserId,
  requireUser,
  RT_COOKIE,
  type AuthenticatedRequest,
  type TenantContext,
  type Role,
} from '../middleware/jwtAuth.js';
import { validate } from '../middleware/miscMiddleware.js';
import {
  loginPasswordSchema,
  switchOrgSchema,
  registerSchema,
  verifyEmailSchema,
} from '../schemas/auth.js';
import {
  verifyUser,
  registerUser,
  issueEmailVerificationToken,
  verifyEmailToken,
} from '../application/auth/userService.js';
import { getUserByEmail } from '../repositories/userRepo.js';
import { sendVerificationEmail } from '../infrastructure/mailService.js';
import {
  isLockedOut,
  recordFailure,
  clearFailures,
  isIpBlocked,
  recordIpFailure,
} from '../application/auth/loginLockout.js';
import {
  resolveDefaultOrg,
  getMembership,
  getUserMemberships,
  isPlatformAdmin,
  orgRoleToGlobalRole,
  type Membership,
} from '../application/org/membershipService.js';

const RT_BASE = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
};
const RT_SET = { ...RT_BASE, maxAge: authConfig.JWT_REFRESH_TTL * 1000 };

async function issueSession(
  res: Response,
  userId: string,
  role: Role,
  tenant?: TenantContext,
): Promise<string> {
  const accessToken = await generateToken(userId, role, tenant);
  res.cookie(RT_COOKIE, await generateRefreshToken(userId, role, undefined, tenant), RT_SET);
  return accessToken;
}

const orgSummary = (m: Membership) => ({
  orgId: m.orgId,
  name: m.orgName,
  slug: m.orgSlug,
  plan: m.orgPlan,
  status: m.orgStatus,
  role: m.role,
});

/** guard 分支统一「发响应即终止」语义，消除 sendProblem+return 样板 */
const problem = (res: Response, status: number, code: string): undefined => {
  sendProblem(res, status, code);
  return undefined;
};

const tenantOf = (m: Membership, platformAdmin: boolean): TenantContext => ({
  tenantId: m.orgId,
  orgRole: m.role,
  platformAdmin,
});

/** 平台管理员 → 默认 org 成员 → role 覆盖（ADR-009），login 与 switch-org 共用 */
async function resolveOrgContext(userId: string) {
  const platformAdmin = await isPlatformAdmin(userId);
  const membership = await resolveDefaultOrg(userId);
  const effectiveRole = membership ? orgRoleToGlobalRole(membership.role) : undefined;
  return {
    platformAdmin,
    effectiveRole,
    tenant: membership
      ? tenantOf(membership, platformAdmin)
      : platformAdmin
        ? ({ platformAdmin } as TenantContext)
        : undefined,
    membership: membership ?? null,
  };
}

type ErrorCfg = { logMsg: string; code: string; endpoint?: string };
type Handler = (req: AuthenticatedRequest, res: Response) => Promise<void>;

const cfg = (logMsg: string, code: string, endpoint?: string): ErrorCfg => ({
  logMsg,
  code,
  ...(endpoint && { endpoint }),
});

const router = Router();

const login: Handler = async (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.ip ?? '';
  const [ipBlockTtl, lockRemaining] = await Promise.all([
    isIpBlocked(clientIp),
    isLockedOut(username),
  ]);
  if (ipBlockTtl > 0) {
    logger.warn({ clientIp: 'hidden', ipBlockTtl }, '[auth] IP 被封锁，拒绝登录');
    res.set('Retry-After', String(ipBlockTtl));
    return problem(res, 429, 'IP_BLOCKED');
  }
  if (lockRemaining > 0) {
    logger.warn({ username }, '[auth] 账户锁定中，拒绝登录尝试');
    return problem(res, 429, 'ACCOUNT_LOCKED');
  }
  const user = await verifyUser(username, password); // 内部 argon2id 常量时间比较，不存在时仍哈希防时序攻击
  if (!user) {
    await Promise.all([recordFailure(username), recordIpFailure(clientIp)]);
    return problem(res, 401, 'INVALID_CREDENTIALS');
  }
  await clearFailures(username);
  // 多租户上下文（ADR-009）：org 成员角色覆盖全局角色（owner→admin）
  const { platformAdmin, effectiveRole, tenant, membership } = await resolveOrgContext(user.id);
  const role = effectiveRole ?? user.role;
  const accessToken = await issueSession(res, user.id, role, tenant);
  logger.info(
    {
      userId: user.id,
      username: user.username,
      role,
      tenantId: membership?.orgId,
      platformAdmin,
    },
    '[auth] 密码登录成功',
  );
  sendData(res, {
    accessToken,
    role,
    userId: user.id,
    org: membership ? orgSummary(membership) : null,
    idleTimeoutMs:
      (role === 'analyst'
        ? authConfig.SESSION_IDLE_TIMEOUT_ANALYST_SEC
        : authConfig.SESSION_IDLE_TIMEOUT_READONLY_SEC) * 1000,
  });
};

const register: Handler = async (req, res) => {
  const { username, password, email, orgName } = req.body;
  if (await getUserByEmail(email)) return problem(res, 409, 'EMAIL_TAKEN');
  let userId = '';
  try {
    userId = await registerUser(username, password, email, orgName);
  } catch (err) {
    // 23505 = PG unique_violation，并发注册兜底（主查重为上方 getUserByEmail）
    if ((err as { code?: string }).code === '23505') return problem(res, 409, 'ACCOUNT_CONFLICT');
    logger.error({ err: String(err) }, '[auth] 注册失败');
    return problem(res, 500, 'REGISTER_FAILED');
  }
  try {
    await sendVerificationEmail(email, await issueEmailVerificationToken(userId));
  } catch (err) {
    logger.warn({ err: String(err), userId }, '[auth] 验证邮件发送失败');
  }
  logger.info({ userId }, '[auth] 注册成功');
  sendCreated(res, { userId, message: '注册成功，请查收验证邮件以完成邮箱验证' });
};

const verifyEmail: Handler = async (req, res) => {
  const userId = await verifyEmailToken(req.body.token);
  if (!userId) return problem(res, 400, 'INVALID_OR_EXPIRED_TOKEN');
  sendData(res, { userId, verified: true });
};

const refresh: Handler = async (req, res) => {
  const refreshToken = req.cookies?.[RT_COOKIE];
  if (!refreshToken) return problem(res, 401, 'REFRESH_TOKEN_MISSING');
  const result = await refreshAccessToken(refreshToken);
  if (!result) {
    res.clearCookie(RT_COOKIE, RT_BASE);
    return problem(res, 401, 'INVALID_REFRESH_TOKEN');
  }
  res.cookie(RT_COOKIE, result.refreshToken, RT_SET);
  sendData(res, { accessToken: result.accessToken });
};

const logout: Handler = async (req, res) => {
  const refreshToken = req.cookies?.[RT_COOKIE] as string | undefined;
  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
    logger.info('[auth] Refresh Token 已撤销');
  }
  res.clearCookie(RT_COOKIE, RT_BASE);
  sendData(res, null);
};

const listOrgs: Handler = async (req, res) => {
  if (!requireUser(req, res)) return;
  sendData(res, {
    activeOrgId: req.user.tenant_id ?? null,
    orgs: (await getUserMemberships(req.user.sub)).map(orgSummary),
  });
};

// POST /api/v1/auth/switch-org — 服务端校验成员身份，杜绝伪造 orgId 越权（最终防线是 Postgres RLS）。
const switchOrg: Handler = async (req, res) => {
  if (!requireUser(req, res)) return;
  const membership = await getMembership(req.user.sub, req.body.orgId);
  if (!membership) {
    logger.warn(
      { userId: hashUserId(req.user.sub), orgId: req.body.orgId },
      '[auth] switch-org 拒绝：非该组织成员',
    );
    return problem(res, 403, 'NOT_A_MEMBER'); // 不区分"组织不存在"与"无权进入"，避免泄露他租户组织
  }
  if (membership.orgStatus !== 'active') return problem(res, 403, 'ORG_INACTIVE');
  const platformAdmin = await isPlatformAdmin(req.user.sub);
  const role = orgRoleToGlobalRole(membership.role);
  const tenant = tenantOf(membership, platformAdmin);
  const accessToken = await issueSession(res, req.user.sub, role, tenant);
  logger.info(
    { userId: hashUserId(req.user.sub), orgId: req.body.orgId, role },
    '[auth] 切换活跃组织成功',
  );
  sendData(res, { accessToken, role, org: orgSummary(membership) });
};

// DELETE /api/v1/auth/me — GDPR Art.17 被遗忘权：匿名化 + 撤销会话。
const deleteMe: Handler = async (req, res) => {
  if (!requireUser(req, res)) return;
  const { anonymizeUser } = await import('../repositories/userRepo.js');
  await revokeAllUserSessions(req.user.sub);
  const ok = await anonymizeUser(req.user.sub);
  logger.info({ userId: hashUserId(req.user.sub), ok }, '[auth] 用户自助删除（匿名化）');
  sendData(res, { anonymized: ok });
};

const LOGIN = cfg('Login error', 'LOGIN_ERROR', 'auth-login');
const REG = cfg('[auth] 注册失败', 'REGISTER_FAILED');
const VERIFY = cfg('[auth] 邮箱验证失败', 'VERIFY_EMAIL_FAILED');
const REFRESH = cfg('Token refresh error', 'REFRESH_ERROR', 'auth-refresh');
const LOGOUT = cfg('Logout error', 'LOGOUT_ERROR', 'auth-logout');
const ORGS = cfg('List user orgs error', 'ORG_LIST_ERROR', 'auth-orgs');
const SWITCH_ORG = cfg('Switch org error', 'SWITCH_ORG_ERROR', 'auth-switch-org');
const DELETE_ME = cfg('Account deletion error', 'ACCOUNT_DELETE_ERROR', 'auth-me-delete');

// 表项顺序 = 原声明顺序；Express 精确路径匹配下注册顺序不影响路由语义
const ROUTES: ['get' | 'post' | 'delete', string, RequestHandler[], Handler, ErrorCfg][] = [
  ['post', '/login/password', [validate(loginPasswordSchema)], login, LOGIN],
  ['post', '/register', [validate(registerSchema)], register, REG],
  ['post', '/verify-email', [validate(verifyEmailSchema)], verifyEmail, VERIFY],
  ['post', '/refresh', [], refresh, REFRESH],
  ['delete', '/logout', [], logout, LOGOUT],
  ['get', '/orgs', [jwtAuth], listOrgs, ORGS],
  ['post', '/switch-org', [jwtAuth, validate(switchOrgSchema)], switchOrg, SWITCH_ORG],
  ['delete', '/me', [jwtAuth], deleteMe, DELETE_ME],
];

for (const [method, path, middlewares, handler, error] of ROUTES)
  router[method](path, ...middlewares, crudRouteHandler(handler, error));

// GET /me 保持裸 handler：无 crudRouteHandler 错误包装，异常行为与原实现一致
router.get('/me', jwtAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!requireUser(req, res)) return;
  const u = req.user;
  sendData(res, {
    userId: u.sub,
    role: u.role,
    tenantId: u.tenant_id ?? null,
    orgRole: u.org_role ?? null,
    platformAdmin: u.platform_admin === true,
    exp: u.exp,
  });
});

export default router;
