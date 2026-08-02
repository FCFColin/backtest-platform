// 认证路由（T-P1-8.3）：JWT 登录/刷新/登出/用户信息/组织切换 + 注册与邮箱验证（ADR-035）
import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { asyncRouteHandler } from './routeUtils.js';
import { authConfig } from '../config/index.js';
import {
  generateToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  jwtAuth,
  type AuthenticatedRequest,
  type TenantContext,
  type Role,
} from '../middleware/jwtAuth.js';
import { hashUserId, requireUser } from '../middleware/jwtAuth.js';
import { validate } from '../middleware/miscMiddleware.js';
import {
  loginPasswordSchema,
  switchOrgSchema,
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from '../schemas/tactical.js';
import {
  verifyUser,
  issueEmailVerificationToken,
  verifyEmailToken,
} from '../application/auth/userService.js';
import { createUserTx, getUserByEmail } from '../repositories/userRepo.js';
import { getClient } from '../db/pool.js';
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

/** 空闲会话超时（P0-04）：analyst 60min，其他 30min（更严格）。 */
function getIdleTimeoutMs(role: string): number {
  return (
    (role === 'analyst'
      ? authConfig.SESSION_IDLE_TIMEOUT_ANALYST_SEC
      : authConfig.SESSION_IDLE_TIMEOUT_READONLY_SEC) * 1000
  );
}
/** 客户端真实 IP（P0-05）：X-Forwarded-For 优先，回退 req.ip。 */
function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  return typeof xff === 'string' && xff.length > 0 ? xff.split(',')[0].trim() : (req.ip ?? '');
}
function orgSummary(m: Membership): Record<string, unknown> {
  return {
    orgId: m.orgId,
    name: m.orgName,
    slug: m.orgSlug,
    plan: m.orgPlan,
    status: m.orgStatus,
    role: m.role,
  };
}

/** 由名称生成 URL 友好且唯一的 org slug（追加随机后缀避免碰撞）。 */
function slugify(name: string): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'org';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

// P0-1 BFF：Refresh Token httpOnly Cookie（防 XSS/CSRF，path 收敛到 /api/v1/auth）
const REFRESH_COOKIE_NAME = 'rt';
const REFRESH_COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
};
const REFRESH_COOKIE_OPTIONS = { ...REFRESH_COOKIE_BASE, maxAge: 7 * 24 * 60 * 60 * 1000 }; // 7 天，与 JWT_REFRESH_TTL 对齐
const REFRESH_COOKIE_CLEAR_OPTIONS = { ...REFRESH_COOKIE_BASE }; // 不传 maxAge

/** 签发 access + refresh 令牌并写 RT Cookie（登录 / 切换组织共用）。 */
async function issueSession(
  res: Response,
  userId: string,
  role: Role,
  tenant: TenantContext | undefined,
): Promise<string> {
  const accessToken = await generateToken(userId, role, tenant);
  const refreshToken = await generateRefreshToken(userId, role, undefined, tenant);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
  return accessToken;
}

const router = Router();

/** POST /api/v1/auth/login/password — argon2id + 常量时间比较 + 枚举防护；RT 写 httpOnly Cookie（P0-1 BFF）。 */
router.post(
  '/login/password',
  validate(loginPasswordSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { username, password } = req.body;
      const clientIp = getClientIp(req);
      const ipBlockTtl = await isIpBlocked(clientIp); // P0-05：IP 维度撞库检测（等保三级 8.1.4 b)）
      if (ipBlockTtl > 0) {
        logger.warn({ clientIp: 'hidden', ipBlockTtl }, '[auth] IP 被封锁，拒绝登录');
        res.set('Retry-After', String(ipBlockTtl));
        sendProblem(res, 429, 'IP_BLOCKED');
        return;
      }
      const lockRemaining = await isLockedOut(username);
      if (lockRemaining > 0) {
        logger.warn({ username }, '[auth] 账户锁定中，拒绝登录尝试');
        sendProblem(res, 429, 'ACCOUNT_LOCKED');
        return;
      }
      const user = await verifyUser(username, password); // 内部 argon2id 常量时间比较，不存在时仍哈希防时序攻击
      if (!user) {
        // Security (T-12)：账号 + IP 维度记录失败用于锁定计数
        await recordFailure(username);
        await recordIpFailure(clientIp);
        sendProblem(res, 401, 'INVALID_CREDENTIALS');
        return;
      }
      await clearFailures(username);
      // 多租户上下文（ADR-032）：org 成员角色覆盖全局角色（owner→admin）
      const platformAdmin = await isPlatformAdmin(user.id);
      const membership = await resolveDefaultOrg(user.id);
      let effectiveRole = user.role;
      let tenant: TenantContext | undefined = platformAdmin ? { platformAdmin } : undefined;
      if (membership) {
        effectiveRole = orgRoleToGlobalRole(membership.role);
        tenant = { tenantId: membership.orgId, orgRole: membership.role, platformAdmin };
      }
      const accessToken = await issueSession(res, user.id, effectiveRole, tenant);
      logger.info(
        {
          userId: user.id,
          username: user.username,
          role: effectiveRole,
          tenantId: membership?.orgId,
          platformAdmin,
        },
        '[auth] 密码登录成功',
      );
      res.json({
        success: true,
        data: {
          accessToken,
          role: effectiveRole,
          userId: user.id,
          org: membership ? orgSummary(membership) : null,
          idleTimeoutMs: getIdleTimeoutMs(effectiveRole),
        },
      });
    },
    { logMsg: 'Login error', code: 'LOGIN_ERROR', endpoint: 'auth-login' },
  ),
);

/** POST /api/v1/auth/register — 自助注册（ADR-035）：单事务创建 用户+组织+owner 成员关系，随后签发邮箱验证令牌并发送邮件（失败不阻塞注册）。 */
router.post('/register', validate(registerSchema), async (req: Request, res: Response) => {
  const { username, password, email, orgName } = req.body;

  const existing = await getUserByEmail(email);
  if (existing) {
    sendProblem(res, 409, 'EMAIL_TAKEN');
    return;
  }

  const client = await getClient();
  let userId = '';
  try {
    await client.query('BEGIN');
    const user = await createUserTx(client, username, password, email, 'admin');
    userId = user.id;
    const slug = slugify(orgName);
    const orgRes = await client.query(
      `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
      [orgName, slug],
    );
    const orgId = orgRes.rows[0].id as string;
    await client.query(`INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`, [
      orgId,
      userId,
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    const msg = String(err);
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      sendProblem(res, 409, 'ACCOUNT_CONFLICT');
      return;
    }
    logger.error({ err: msg }, '[auth] 注册失败');
    sendProblem(res, 500, 'REGISTER_FAILED');
    return;
  } finally {
    client.release();
  }

  try {
    const token = await issueEmailVerificationToken(userId);
    await sendVerificationEmail(email, token);
  } catch (err) {
    logger.warn({ err: String(err), userId }, '[auth] 验证邮件发送失败（可稍后重发）');
  }

  logger.info({ userId }, '[auth] 注册成功');
  res.status(201).json({
    success: true,
    data: { userId, message: '注册成功，请查收验证邮件以完成邮箱验证' },
  });
});

/** POST /api/v1/auth/verify-email — 校验邮箱验证令牌（ADR-035） */
router.post('/verify-email', validate(verifyEmailSchema), async (req: Request, res: Response) => {
  const { token } = req.body;
  const userId = await verifyEmailToken(token);
  if (!userId) {
    sendProblem(res, 400, 'INVALID_OR_EXPIRED_TOKEN');
    return;
  }
  res.json({ success: true, data: { userId, verified: true } });
});

/** POST /api/v1/auth/resend-verification — 重发验证邮件（需登录；不泄露邮箱是否存在/有效，统一返回成功） */
router.post(
  '/resend-verification',
  jwtAuth,
  validate(resendVerificationSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!requireUser(req, res)) return;
    const { email } = req.body;
    try {
      const token = await issueEmailVerificationToken(req.user.sub);
      await sendVerificationEmail(email, token);
    } catch (err) {
      logger.warn(
        { err: String(err), userId: hashUserId(req.user.sub) },
        '[auth] 重发验证邮件失败',
      );
    }
    res.json({ success: true, data: { message: '若邮箱有效，验证邮件已发送' } });
  },
);

/** POST /api/v1/auth/refresh — RT 从 httpOnly Cookie 读取，轮换后写回，旧 RT 失效。 */
router.post(
  '/refresh',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
      if (!refreshToken) {
        sendProblem(res, 401, 'REFRESH_TOKEN_MISSING');
        return;
      }
      const result = await refreshAccessToken(refreshToken);
      if (!result) {
        res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_CLEAR_OPTIONS);
        sendProblem(res, 401, 'INVALID_REFRESH_TOKEN');
        return;
      } // 无效 RT：清 Cookie，避免浏览器持有过期凭证
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, REFRESH_COOKIE_OPTIONS);
      res.json({ success: true, data: { accessToken: result.accessToken } });
    },
    { logMsg: 'Token refresh error', code: 'REFRESH_ERROR', endpoint: 'auth-refresh' },
  ),
);

/** DELETE /api/v1/auth/logout — 撤销 RT + 清除 Cookie。 */
router.delete(
  '/logout',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
      if (refreshToken) {
        await revokeRefreshToken(refreshToken);
        logger.info('[auth] Refresh Token 已撤销');
      }
      res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS); // 无论 RT 是否存在都清除，避免浏览器残留过期凭证
      res.json({ success: true });
    },
    { logMsg: 'Logout error', code: 'LOGOUT_ERROR', endpoint: 'auth-logout' },
  ),
);

router.get('/me', jwtAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!requireUser(req, res)) return;
  res.json({
    success: true,
    data: {
      userId: req.user.sub,
      role: req.user.role,
      tenantId: req.user.tenant_id ?? null,
      orgRole: req.user.org_role ?? null,
      platformAdmin: req.user.platform_admin === true,
      exp: req.user.exp,
    },
  });
});

router.get(
  '/orgs',
  jwtAuth,
  asyncRouteHandler(
    async (req, res): Promise<void> => {
      if (!requireUser(req, res)) return;
      const memberships = await getUserMemberships(req.user.sub);
      res.json({
        success: true,
        data: { activeOrgId: req.user.tenant_id ?? null, orgs: memberships.map(orgSummary) },
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
  asyncRouteHandler(
    async (req, res): Promise<void> => {
      if (!requireUser(req, res)) return;
      const { orgId } = req.body;
      const membership = await getMembership(req.user.sub, orgId);
      if (!membership) {
        logger.warn(
          { userId: hashUserId(req.user.sub), orgId },
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
      logger.info({ userId: hashUserId(req.user.sub), orgId, role }, '[auth] 切换活跃组织成功');
      res.json({ success: true, data: { accessToken, role, org: orgSummary(membership) } });
    },
    { logMsg: 'Switch org error', code: 'SWITCH_ORG_ERROR', endpoint: 'auth-switch-org' },
  ),
);

/** DELETE /api/v1/auth/me — GDPR Art.17 被遗忘权：匿名化 + 撤销会话。 */
router.delete(
  '/me',
  jwtAuth,
  asyncRouteHandler(
    async (req, res): Promise<void> => {
      if (!requireUser(req, res)) return;
      const { anonymizeUser } = await import('../repositories/userRepo.js');
      await revokeAllUserSessions(req.user.sub);
      const ok = await anonymizeUser(req.user.sub);
      logger.info({ userId: hashUserId(req.user.sub), ok }, '[auth] 用户自助删除（匿名化）');
      res.json({ success: true, data: { anonymized: ok } });
    },
    { logMsg: 'Account deletion error', code: 'ACCOUNT_DELETE_ERROR', endpoint: 'auth-me-delete' },
  ),
);

export default router;
