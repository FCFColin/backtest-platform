/**
 * 认证路由（T-P1-8.3）
 *
 * 提供 JWT 认证端点：登录、刷新、登出。
 *
 * 企业理由：JWT/RBAC 实现完整但此前未接入，属于"基础设施建成未接入"。
 * 接入后管理端点可通过 RBAC 区分管理员/分析员/只读角色，
 * 是安全面试核心能力展示。
 *
 * 权衡：
 * - 登录端点使用 ADMIN_API_KEY 作为共享凭证验证（MVP 阶段无用户表），
 *   生产环境应替换为用户名+密码（bcrypt）或 OIDC 集成。
 * - Refresh Token 存储在 Redis（含内存回退），支持多实例部署和 Token Family 复用检测。
 *
 * HTTP 方法语义（F-2 修正）：
 * - POST /login    - 创建新会话/令牌（创建语义，POST 合适）
 * - POST /refresh  - 创建新令牌对（创建语义，POST 合适）
 * - DELETE /logout - 删除会话/令牌（删除语义，DELETE 合适）
 * - GET /me        - 读取当前用户信息（读取语义，GET 合适）
 *
 * 企业理由（logout 使用 DELETE）：
 * - logout 语义为"删除/撤销一个会话或令牌"，对应 REST 中删除资源
 *   （RFC 9110 §9.3 DELETE 方法），DELETE 表示"删除目标资源"。
 * - 使用 DELETE 而非 POST 的好处：
 *   1. 语义明确：HTTP 方法直接表达"删除"意图，工具链/网关可据此做访问控制
 *   2. 缓存友好：DELETE 响应不可缓存但语义清晰，POST 则语义模糊
 *   3. RESTful 一致性：CRUD 操作映射到 HTTP 方法是 REST 架构的核心约束
 * - 旧 POST /logout 保留为 deprecated，通过 RFC 8594 Deprecation + Sunset 头
 *   引导客户端迁移，6 个月过渡期后移除。
 */

import { Router, type Request, type Response } from 'express';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { config } from '../config/index.js';
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
import { Role } from '../middleware/rbac.js';

function hashUserId(sub: string | undefined): string | undefined {
  if (!sub) return undefined;
  return createHash('sha256').update(sub).digest('hex').slice(0, 16);
}
import {
  verifyUser,
  createUserTx,
  issueEmailVerificationToken,
  verifyEmailToken,
  getUserByEmail,
} from '../services/userService.js';
import { getClient } from '../db/index.js';
import { sendVerificationEmail } from '../services/mailService.js';
import { isLockedOut, recordFailure, clearFailures } from '../services/loginLockout.js';
import {
  resolveDefaultOrg,
  getMembership,
  getUserMemberships,
  isPlatformAdmin,
  orgRoleToGlobalRole,
  type Membership,
} from '../services/membershipService.js';

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

/** 废弃端点过渡期截止日期（6 个月后），符合 RFC 8594 Sunset 头规范 */
const SUNSET_DATE = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

/**
 * POST /api/v1/auth/login - 登录获取 Access Token + Refresh Token
 *
 * 请求体：{ apiKey: string }
 * 响应：{ success: true, data: { accessToken, refreshToken, role } }
 *
 * 企业理由：登录是认证流程入口。MVP 阶段使用 API Key 作为共享凭证，
 * 验证通过后签发 JWT。生产环境应替换为用户名+密码验证。
 * POST 语义正确——创建新的会话/令牌资源。
 *
 * @deprecated 使用 POST /api/v1/auth/login/password 替代。
 * 共享 API Key 无法区分用户身份，不符合 SOC 2/ISO 27001 可追溯要求。
 * 所有用户迁移到用户名+密码认证后，此端点将被移除。
 */
router.post('/login', async (req: Request, res: Response) => {
  const { apiKey } = req.body as { apiKey?: string };

  // 开发环境且未配置 ADMIN_API_KEY 时，允许直接登录（方便本地开发）
  if (config.NODE_ENV !== 'production' && !config.ADMIN_API_KEY) {
    const accessToken = await generateToken('dev-user', Role.ADMIN);
    const refreshToken = await generateRefreshToken('dev-user', Role.ADMIN);
    logger.info({ userId: 'dev-user', role: Role.ADMIN }, '[auth] 开发环境登录成功');
    res.json({
      success: true,
      data: { accessToken, refreshToken, role: Role.ADMIN, userId: 'dev-user' },
    });
    return;
  }

  // 生产环境必须验证 API Key
  if (!apiKey) {
    sendProblem(res, 401, 'MISSING_API_KEY', 'Unauthorized', { detail: '缺少 apiKey' });
    return;
  }

  if (apiKey.length > 128 || apiKey.length !== config.ADMIN_API_KEY.length) {
    sendProblem(res, 401, 'INVALID_API_KEY', 'Unauthorized', { detail: 'API Key 无效' });
    return;
  }

  const a = Buffer.from(apiKey, 'utf-8');
  const b = Buffer.from(config.ADMIN_API_KEY, 'utf-8');
  if (!timingSafeEqual(a, b)) {
    sendProblem(res, 401, 'INVALID_API_KEY', 'Unauthorized', { detail: 'API Key 无效' });
    return;
  }

  // 验证通过：ADMIN_API_KEY 现为破窗（break-glass）平台密钥（ADR-033），
  // 签发携带 platform_admin 的令牌（不绑定具体租户），而非历史的租户内 admin。
  const userId = 'platform:break-glass';
  const role = Role.ADMIN;
  const tenant: TenantContext = { platformAdmin: true };
  const accessToken = await generateToken(userId, role, tenant);
  const refreshToken = await generateRefreshToken(userId, role, undefined, tenant);

  logger.info({ userId, role, platformAdmin: true }, '[auth] 破窗平台密钥登录成功');
  res.json({
    success: true,
    data: { accessToken, refreshToken, role, userId, platformAdmin: true },
  });
});

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
router.post('/login/password', async (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    sendProblem(res, 422, 'MISSING_CREDENTIALS', 'Missing credentials', {
      detail: '缺少用户名或密码',
    });
    return;
  }

  const lockRemaining = await isLockedOut(username);
  if (lockRemaining > 0) {
    logger.warn({ username }, '[auth] 账户锁定中，拒绝登录尝试');
    sendProblem(res, 429, 'ACCOUNT_LOCKED', 'Account locked', {
      detail: '尝试次数过多，账户暂时锁定，请稍后再试',
    });
    return;
  }

  // 企业理由：verifyUser 内部使用 argon2id 常量时间比较，
  // 且用户不存在时仍执行哈希运算防止时序攻击
  const user = await verifyUser(username, password);

  if (!user) {
    // Security (T-12): 记录失败用于锁定计数。
    await recordFailure(username);
    sendProblem(res, 401, 'INVALID_CREDENTIALS', 'Unauthorized', { detail: '用户名或密码错误' });
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
});

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

/**
 * POST /api/v1/auth/register - 自助注册（ADR-035）
 *
 * 请求体：{ username, password, email, orgName }
 * 在单事务内创建：用户 + 组织 + owner 成员关系；随后签发邮箱验证令牌并发送验证邮件。
 *
 * 企业理由：SaaS 自助开通的核心入口。三者一并落库保证不出现"有用户无组织"的孤儿态；
 * 邮箱验证（异步、不阻塞注册成功）用于防滥用与找回。返回不含令牌——引导用户登录/验证。
 */
router.post('/register', async (req: Request, res: Response) => {
  const { username, password, email, orgName } = req.body as {
    username?: string;
    password?: string;
    email?: string;
    orgName?: string;
  };

  if (!username || !password || !email || !orgName) {
    sendProblem(res, 422, 'MISSING_FIELDS', 'Missing fields', {
      detail: '缺少 username/password/email/orgName',
    });
    return;
  }
  if (password.length < 8) {
    sendProblem(res, 422, 'WEAK_PASSWORD', 'Weak password', { detail: '密码长度至少 8 位' });
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    sendProblem(res, 422, 'INVALID_EMAIL', 'Invalid email', { detail: '邮箱格式不合法' });
    return;
  }

  // 预检邮箱占用（最终唯一性仍由 DB 唯一索引兜底）
  const existing = await getUserByEmail(email);
  if (existing) {
    sendProblem(res, 409, 'EMAIL_TAKEN', 'Conflict', { detail: '该邮箱已被注册' });
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
    // 唯一约束冲突（用户名/邮箱/slug）
    if (msg.includes('duplicate key') || msg.includes('unique')) {
      sendProblem(res, 409, 'ACCOUNT_CONFLICT', 'Conflict', { detail: '用户名或邮箱已被占用' });
      return;
    }
    logger.error({ err: msg }, '[auth] 注册失败');
    sendProblem(res, 500, 'REGISTER_FAILED', 'Internal Server Error', { detail: '注册失败' });
    return;
  } finally {
    client.release();
  }

  // 事务外发送验证邮件（失败不影响注册成功，用户可重发）
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

/**
 * POST /api/v1/auth/verify-email - 校验邮箱验证令牌（ADR-035）
 *
 * 请求体：{ token }
 */
router.post('/verify-email', async (req: Request, res: Response) => {
  const { token } = req.body as { token?: string };
  if (!token) {
    sendProblem(res, 422, 'MISSING_TOKEN', 'Missing token', { detail: '缺少 token' });
    return;
  }
  const userId = await verifyEmailToken(token);
  if (!userId) {
    sendProblem(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'Bad Request', {
      detail: '验证链接无效或已过期',
    });
    return;
  }
  res.json({ success: true, data: { userId, verified: true } });
});

/**
 * POST /api/v1/auth/resend-verification - 重发验证邮件（需登录，ADR-035）
 */
router.post('/resend-verification', jwtAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    sendProblem(res, 401, 'UNAUTHORIZED', 'Unauthorized', { detail: '未认证' });
    return;
  }
  const { email } = req.body as { email?: string };
  if (!email) {
    sendProblem(res, 422, 'MISSING_EMAIL', 'Missing email', { detail: '缺少 email' });
    return;
  }
  try {
    const token = await issueEmailVerificationToken(req.user.sub);
    await sendVerificationEmail(email, token);
  } catch (err) {
    logger.warn({ err: String(err), userId: hashUserId(req.user.sub) }, '[auth] 重发验证邮件失败');
  }
  // 不泄露邮箱是否存在/有效，统一返回成功
  res.json({ success: true, data: { message: '若邮箱有效，验证邮件已发送' } });
});

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
    sendProblem(res, 422, 'MISSING_REFRESH_TOKEN', 'Missing refresh token', {
      detail: '缺少 refreshToken',
    });
    return;
  }

  const result = await refreshAccessToken(refreshToken);
  if (!result) {
    sendProblem(res, 401, 'INVALID_REFRESH_TOKEN', 'Unauthorized', {
      detail: 'Refresh Token 无效或已过期',
    });
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
  if (!req.user) {
    sendProblem(res, 401, 'UNAUTHORIZED', 'Unauthorized', { detail: '未认证' });
    return;
  }

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
  if (!req.user) {
    sendProblem(res, 401, 'UNAUTHORIZED', 'Unauthorized', { detail: '未认证' });
    return;
  }
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
  if (!req.user) {
    sendProblem(res, 401, 'UNAUTHORIZED', 'Unauthorized', { detail: '未认证' });
    return;
  }
  const { orgId } = req.body as { orgId?: string };
  if (!orgId) {
    sendProblem(res, 422, 'MISSING_ORG_ID', 'Missing orgId', { detail: '缺少 orgId' });
    return;
  }

  const membership = await getMembership(req.user.sub, orgId);
  if (!membership) {
    // 不区分"组织不存在"与"无权进入"，避免泄露他租户组织是否存在
    logger.warn(
      { userId: hashUserId(req.user.sub), orgId },
      '[auth] switch-org 拒绝：非该组织成员',
    );
    sendProblem(res, 403, 'NOT_A_MEMBER', 'Forbidden', { detail: '无权进入该组织' });
    return;
  }
  if (membership.orgStatus !== 'active') {
    sendProblem(res, 403, 'ORG_INACTIVE', 'Forbidden', {
      detail: `组织当前状态为 ${membership.orgStatus}，无法进入`,
    });
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
  if (!req.user) {
    sendProblem(res, 401, 'UNAUTHORIZED', 'Unauthorized', { detail: '未认证' });
    return;
  }
  const { anonymizeUser } = await import('../services/userService.js');
  await revokeAllUserSessions(req.user.sub);
  const ok = await anonymizeUser(req.user.sub);
  logger.info({ userId: hashUserId(req.user.sub), ok }, '[auth] 用户自助删除（匿名化）');
  res.json({ success: true, data: { anonymized: ok } });
});

// ============================================================
// 废弃端点（POST /logout → DELETE /logout 迁移过渡期）
//
// 企业理由：保持向后兼容，旧客户端仍可使用 POST /logout。
// 通过 RFC 8594 Deprecation + Sunset 头引导客户端迁移。
// 过渡期 6 个月后移除此路由。
// ============================================================

/** @deprecated 使用 DELETE /logout 替代。Sunset 后将移除此端点。 */
router.post('/logout', async (req: Request, res: Response) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '</api/v1/auth/logout>; rel="successor-version"');
  logger.warn(
    `[DEPRECATED] 客户端调用了废弃端点 POST /logout，请迁移到 DELETE /logout。Sunset: ${SUNSET_DATE}`,
  );

  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
    logger.info('[auth] Refresh Token 已撤销');
  }

  res.json({ success: true });
});

export default router;
