import { Router, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { crudRouteHandler, sendData } from './routeUtils.js';
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

/** 平台管理员 → 默认 org 成员 → role 覆盖（ADR-009），login 与 switch-org 共用 */
async function resolveOrgContext(userId: string) {
  const platformAdmin = await isPlatformAdmin(userId);
  const membership = await resolveDefaultOrg(userId);
  if (!membership)
    return {
      platformAdmin,
      effectiveRole: undefined as Role | undefined,
      tenant: platformAdmin ? ({ platformAdmin } as TenantContext) : undefined,
      membership: null,
    };
  const effectiveRole = orgRoleToGlobalRole(membership.role);
  const tenant: TenantContext = {
    tenantId: membership.orgId,
    orgRole: membership.role,
    platformAdmin,
  };
  return { platformAdmin, effectiveRole, tenant, membership };
}

const router = Router();

router.post(
  '/login/password',
  validate(loginPasswordSchema),
  crudRouteHandler(
    async (req, res) => {
      const { username, password } = req.body;
      const clientIp = req.ip ?? '';
      const [ipBlockTtl, lockRemaining] = await Promise.all([
        isIpBlocked(clientIp),
        isLockedOut(username),
      ]);
      if (ipBlockTtl > 0) {
        logger.warn({ clientIp: 'hidden', ipBlockTtl }, '[auth] IP 被封锁，拒绝登录');
        res.set('Retry-After', String(ipBlockTtl));
        sendProblem(res, 429, 'IP_BLOCKED');
        return;
      }
      if (lockRemaining > 0) {
        logger.warn({ username }, '[auth] 账户锁定中，拒绝登录尝试');
        sendProblem(res, 429, 'ACCOUNT_LOCKED');
        return;
      }
      const user = await verifyUser(username, password); // 内部 argon2id 常量时间比较，不存在时仍哈希防时序攻击
      if (!user) {
        await Promise.all([recordFailure(username), recordIpFailure(clientIp)]);
        sendProblem(res, 401, 'INVALID_CREDENTIALS');
        return;
      }
      await clearFailures(username);
      // 多租户上下文（ADR-009）：org 成员角色覆盖全局角色（owner→admin）
      const { platformAdmin, effectiveRole, tenant, membership } = await resolveOrgContext(user.id);
      const accessToken = await issueSession(res, user.id, effectiveRole ?? user.role, tenant);
      logger.info(
        {
          userId: user.id,
          username: user.username,
          role: effectiveRole ?? user.role,
          tenantId: membership?.orgId,
          platformAdmin,
        },
        '[auth] 密码登录成功',
      );
      sendData(res, {
        accessToken,
        role: effectiveRole ?? user.role,
        userId: user.id,
        org: membership ? orgSummary(membership) : null,
        idleTimeoutMs:
          ((effectiveRole ?? user.role) === 'analyst'
            ? authConfig.SESSION_IDLE_TIMEOUT_ANALYST_SEC
            : authConfig.SESSION_IDLE_TIMEOUT_READONLY_SEC) * 1000,
      });
    },
    { logMsg: 'Login error', code: 'LOGIN_ERROR', endpoint: 'auth-login' },
  ),
);

router.post(
  '/register',
  validate(registerSchema),
  crudRouteHandler(
    async (req, res) => {
      const { username, password, email, orgName } = req.body;
      if (await getUserByEmail(email)) {
        sendProblem(res, 409, 'EMAIL_TAKEN');
        return;
      }
      let userId = '';
      try {
        userId = await registerUser(username, password, email, orgName);
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          sendProblem(res, 409, 'ACCOUNT_CONFLICT');
          return;
        } // 23505 = PG unique_violation
        logger.error({ err: String(err) }, '[auth] 注册失败');
        sendProblem(res, 500, 'REGISTER_FAILED');
        return;
      }
      try {
        await sendVerificationEmail(email, await issueEmailVerificationToken(userId));
      } catch (err) {
        logger.warn({ err: String(err), userId }, '[auth] 验证邮件发送失败');
      }
      logger.info({ userId }, '[auth] 注册成功');
      res.status(201).json({
        success: true,
        data: { userId, message: '注册成功，请查收验证邮件以完成邮箱验证' },
      });
    },
    { logMsg: '[auth] 注册失败', code: 'REGISTER_FAILED' },
  ),
);

router.post(
  '/verify-email',
  validate(verifyEmailSchema),
  crudRouteHandler(
    async (req, res) => {
      const { token } = req.body;
      const userId = await verifyEmailToken(token);
      if (!userId) {
        sendProblem(res, 400, 'INVALID_OR_EXPIRED_TOKEN');
        return;
      }
      sendData(res, { userId, verified: true });
    },
    { logMsg: '[auth] 邮箱验证失败', code: 'VERIFY_EMAIL_FAILED' },
  ),
);

router.post(
  '/refresh',
  crudRouteHandler(
    async (req, res) => {
      const refreshToken = req.cookies?.[RT_COOKIE];
      if (!refreshToken) {
        sendProblem(res, 401, 'REFRESH_TOKEN_MISSING');
        return;
      }
      const result = await refreshAccessToken(refreshToken);
      if (!result) {
        res.clearCookie(RT_COOKIE, RT_BASE);
        sendProblem(res, 401, 'INVALID_REFRESH_TOKEN');
        return;
      }
      res.cookie(RT_COOKIE, result.refreshToken, RT_SET);
      sendData(res, { accessToken: result.accessToken });
    },
    { logMsg: 'Token refresh error', code: 'REFRESH_ERROR', endpoint: 'auth-refresh' },
  ),
);

router.delete(
  '/logout',
  crudRouteHandler(
    async (req, res) => {
      const refreshToken = req.cookies?.[RT_COOKIE] as string | undefined;
      if (refreshToken) {
        await revokeRefreshToken(refreshToken);
        logger.info('[auth] Refresh Token 已撤销');
      }
      res.clearCookie(RT_COOKIE, RT_BASE);
      sendData(res, null);
    },
    { logMsg: 'Logout error', code: 'LOGOUT_ERROR', endpoint: 'auth-logout' },
  ),
);

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

router.get(
  '/orgs',
  jwtAuth,
  crudRouteHandler(
    async (req, res): Promise<void> => {
      if (!requireUser(req, res)) return;
      sendData(res, {
        activeOrgId: req.user.tenant_id ?? null,
        orgs: (await getUserMemberships(req.user.sub)).map(orgSummary),
      });
    },
    { logMsg: 'List user orgs error', code: 'ORG_LIST_ERROR', endpoint: 'auth-orgs' },
  ),
);

/** POST /api/v1/auth/switch-org — 服务端校验成员身份，杜绝伪造 orgId 越权（最终防线是 Postgres RLS）。 */
router.post(
  '/switch-org',
  jwtAuth,
  validate(switchOrgSchema),
  crudRouteHandler(
    async (req, res): Promise<void> => {
      if (!requireUser(req, res)) return;
      const membership = await getMembership(req.user.sub, req.body.orgId);
      if (!membership) {
        logger.warn(
          { userId: hashUserId(req.user.sub), orgId: req.body.orgId },
          '[auth] switch-org 拒绝：非该组织成员',
        );
        sendProblem(res, 403, 'NOT_A_MEMBER');
        return;
      } // 不区分"组织不存在"与"无权进入"，避免泄露他租户组织
      if (membership.orgStatus !== 'active') {
        sendProblem(res, 403, 'ORG_INACTIVE');
        return;
      }
      const platformAdmin = await isPlatformAdmin(req.user.sub);
      const role = orgRoleToGlobalRole(membership.role);
      const tenant: TenantContext = {
        tenantId: membership.orgId,
        orgRole: membership.role,
        platformAdmin,
      };
      const accessToken = await issueSession(res, req.user.sub, role, tenant);
      logger.info(
        { userId: hashUserId(req.user.sub), orgId: req.body.orgId, role },
        '[auth] 切换活跃组织成功',
      );
      sendData(res, { accessToken, role, org: orgSummary(membership) });
    },
    { logMsg: 'Switch org error', code: 'SWITCH_ORG_ERROR', endpoint: 'auth-switch-org' },
  ),
);

/** DELETE /api/v1/auth/me — GDPR Art.17 被遗忘权：匿名化 + 撤销会话。 */
router.delete(
  '/me',
  jwtAuth,
  crudRouteHandler(
    async (req, res): Promise<void> => {
      if (!requireUser(req, res)) return;
      const { anonymizeUser } = await import('../repositories/userRepo.js');
      await revokeAllUserSessions(req.user.sub);
      const ok = await anonymizeUser(req.user.sub);
      logger.info({ userId: hashUserId(req.user.sub), ok }, '[auth] 用户自助删除（匿名化）');
      sendData(res, { anonymized: ok });
    },
    { logMsg: 'Account deletion error', code: 'ACCOUNT_DELETE_ERROR', endpoint: 'auth-me-delete' },
  ),
);

export default router;
