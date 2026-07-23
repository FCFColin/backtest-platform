/**
 * 认证路由（T-P1-8.3）
 *
 * 提供 JWT 认证端点：登录、刷新、登出、用户信息、组织切换。
 * 注册与邮箱验证路由见 authRegistrationRoutes.ts。
 *
 * HTTP 方法语义：POST /login/password（创建会话）、POST /refresh（创建令牌）、
 * DELETE /logout（删除会话）、GET /me（读取用户信息）。
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import {
  generateToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  jwtAuth,
  type AuthenticatedRequest,
  type TenantContext,
} from '../middleware/jwtAuth.js';
import { hashUserId, requireUser } from '../middleware/authTypes.js';
import { validate } from '../middleware/validate.js';
import { loginPasswordSchema } from '../schemas/auth.js';
import registrationRoutes from './authRegistrationRoutes.js';
import { verifyUser } from '../application/auth/userService.js';
import { isLockedOut, recordFailure, clearFailures } from '../application/auth/loginLockout.js';
import {
  resolveDefaultOrg,
  getMembership,
  getUserMemberships,
  isPlatformAdmin,
  orgRoleToGlobalRole,
  type Membership,
} from '../application/org/membershipService.js';

/** 将成员关系序列化为响应中的组织摘要 */
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

const router = Router();

/**
 * POST /api/v1/auth/login/password - 用户名+密码登录
 *
 * 请求体：{ username: string, password: string }
 * 响应：{ success: true, data: { accessToken, refreshToken, role, userId } }
 *
 * 企业理由：共享 API Key 无法区分用户身份，不符合 SOC 2/ISO 27001 可追溯要求。
 * 用户名+密码认证支持多用户注册、角色分配、操作审计，是认证体系的基础。
 * 密码使用 argon2id 哈希存储（OWASP 推荐），即使数据库泄露也无法逆向获取明文。
 * 验证失败不区分"用户不存在"和"密码错误"，防止用户名枚举攻击。
 * POST 语义正确——创建新的会话/令牌资源。
 */
router.post(
  '/login/password',
  validate(loginPasswordSchema),
  async (req: Request, res: Response) => {
    const { username, password } = req.body;

    const lockRemaining = await isLockedOut(username);
    if (lockRemaining > 0) {
      logger.warn({ username }, '[auth] 账户锁定中，拒绝登录尝试');
      sendProblem(res, 429, 'ACCOUNT_LOCKED');
      return;
    }

    // 企业理由：verifyUser 内部使用 argon2id 常量时间比较，
    // 且用户不存在时仍执行哈希运算防止时序攻击
    const user = await verifyUser(username, password);

    if (!user) {
      // Security (T-12): 记录失败用于锁定计数。
      await recordFailure(username);
      sendProblem(res, 401, 'INVALID_CREDENTIALS');
      return;
    }

    // Security (T-12): 登录成功，清除失败计数与锁定。
    await clearFailures(username);

    // 多租户上下文解析（ADR-032）：登录时解析默认活跃组织并嵌入令牌。
    // org 成员角色覆盖全局角色（owner→admin），使既有 RBAC 在租户内正确判权。
    const platformAdmin = await isPlatformAdmin(user.id);
    const membership = await resolveDefaultOrg(user.id);
    let effectiveRole = user.role;
    let tenant: TenantContext | undefined = platformAdmin ? { platformAdmin } : undefined;
    if (membership) {
      effectiveRole = orgRoleToGlobalRole(membership.role);
      tenant = { tenantId: membership.orgId, orgRole: membership.role, platformAdmin };
    }

    const accessToken = await generateToken(user.id, effectiveRole, tenant);
    const refreshToken = await generateRefreshToken(user.id, effectiveRole, undefined, tenant);

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
        refreshToken,
        role: effectiveRole,
        userId: user.id,
        org: membership ? orgSummary(membership) : null,
      },
    });
  },
);

// 挂载注册与邮箱验证路由（拆分自本文件，降低单文件复杂度）
router.use(registrationRoutes);

/**
 * POST /api/v1/auth/refresh - 使用 Refresh Token 刷新 Access Token
 *
 * 请求体：{ refreshToken: string }
 * 响应：{ success: true, data: { accessToken, refreshToken } }
 *
 * 企业理由：Access Token 短期有效（15min），Refresh Token 长期有效（7d），
 * 用户无需频繁重新登录。Refresh Token 轮换机制——每次刷新后旧 token 失效。
 * POST 语义正确——创建新的令牌资源。
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    sendProblem(res, 422, 'MISSING_REFRESH_TOKEN');
    return;
  }

  const result = await refreshAccessToken(refreshToken);
  if (!result) {
    sendProblem(res, 401, 'INVALID_REFRESH_TOKEN');
    return;
  }

  res.json({
    success: true,
    data: { accessToken: result.accessToken, refreshToken: result.refreshToken },
  });
});

/**
 * DELETE /api/v1/auth/logout - 登出（撤销 Refresh Token）
 *
 * 请求体：{ refreshToken: string }
 * 响应：{ success: true }
 *
 * 企业理由：登出语义为"删除/撤销会话令牌"，对应 REST 中 DELETE 方法
 * （RFC 9110 §9.3）。DELETE 表示"删除目标资源"，logout 正是删除
 * 一个已存在的会话/令牌资源。使用 DELETE 而非 POST 的好处：
 * 1. 语义明确——HTTP 方法直接表达"删除"意图，API 网关/负载均衡器
 *    可根据 DELETE 方法做差异化路由和限流策略
 * 2. RESTful 一致性——CRUD 操作映射到 HTTP 方法是 REST 架构核心约束，
 *    工具链（Swagger/OpenAPI 代码生成器）据此生成正确的客户端 SDK
 * 3. 安全审计——DELETE 请求在日志和 WAF 规则中更容易被识别为敏感操作
 * 登出时撤销 Refresh Token，防止被盗 token 继续使用。
 * Access Token 无法撤销（无状态），但其短期有效期（15min）限制了风险窗口。
 */
router.delete('/logout', async (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
    logger.info('[auth] Refresh Token 已撤销');
  }

  res.json({ success: true });
});

/**
 * GET /api/v1/auth/me - 获取当前用户信息（需 JWT 认证）
 *
 * 企业理由：前端通过此端点验证 token 有效性并获取角色信息，
 * 用于 UI 权限控制（如隐藏管理按钮）。
 */
// Security (T-12 / OWASP A07): /me 显式挂载 jwtAuth。
// 此前 auth 路由未挂认证中间件，/me 仅检查 req.user 而 req.user 从不会被填充，
// 导致始终 401 或（在其他中间件残留 user 时）行为不确定。这里在路由级强制认证，
// 使 req.user 被正确解析，同时不影响 login/refresh 等需匿名访问的端点。
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

/**
 * GET /api/v1/auth/orgs - 列出当前用户所属的全部组织（org 切换器数据源）
 *
 * 企业理由：前端 org 切换器需要展示用户可进入的组织及其角色。
 * 该列表来自 memberships 表，反映多对多归属关系。
 */
router.get('/orgs', jwtAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireUser(req, res)) return;
  const memberships = await getUserMemberships(req.user.sub);
  res.json({
    success: true,
    data: {
      activeOrgId: req.user.tenant_id ?? null,
      orgs: memberships.map(orgSummary),
    },
  });
});

/**
 * POST /api/v1/auth/switch-org - 切换活跃组织，签发携带新租户上下文的令牌
 *
 * 请求体：{ orgId: string }
 * 响应：{ success: true, data: { accessToken, refreshToken, role, org } }
 *
 * 企业理由：一个用户可属于多个组织。切换组织即切换活跃租户，必须重新签发令牌
 * 以更新 tenant_id/org_role。安全关键：服务端通过 getMembership 校验用户确属
 * 目标组织，杜绝用户伪造 orgId 越权进入他租户（隔离的最终防线仍是 Postgres RLS）。
 */
router.post('/switch-org', jwtAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireUser(req, res)) return;
  const { orgId } = req.body as { orgId?: string };
  if (!orgId) {
    sendProblem(res, 422, 'MISSING_ORG_ID');
    return;
  }

  const membership = await getMembership(req.user.sub, orgId);
  if (!membership) {
    // 不区分"组织不存在"与"无权进入"，避免泄露他租户组织是否存在
    logger.warn(
      { userId: hashUserId(req.user.sub), orgId },
      '[auth] switch-org 拒绝：非该组织成员',
    );
    sendProblem(res, 403, 'NOT_A_MEMBER');
    return;
  }
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

  const accessToken = await generateToken(req.user.sub, role, tenant);
  const refreshToken = await generateRefreshToken(req.user.sub, role, undefined, tenant);

  logger.info({ userId: hashUserId(req.user.sub), orgId, role }, '[auth] 切换活跃组织成功');
  res.json({
    success: true,
    data: { accessToken, refreshToken, role, org: orgSummary(membership) },
  });
});

/**
 * DELETE /api/v1/auth/me - 删除当前账户（GDPR Art.17 被遗忘权自助入口）
 *
 * 企业理由（ADR-023）：数据主体有权请求删除其个人数据。默认采用匿名化
 * （保留引用完整性与聚合统计，抹除 PII），并撤销其所有会话令牌。
 * 仅作用于当前认证用户自身，不可删除他人账户。
 */
router.delete('/me', jwtAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireUser(req, res)) return;
  const { anonymizeUser } = await import('../repositories/userRepo.js');
  await revokeAllUserSessions(req.user.sub);
  const ok = await anonymizeUser(req.user.sub);
  logger.info({ userId: hashUserId(req.user.sub), ok }, '[auth] 用户自助删除（匿名化）');
  res.json({ success: true, data: { anonymized: ok } });
});

export default router;
