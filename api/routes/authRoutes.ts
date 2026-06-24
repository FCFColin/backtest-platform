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
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import {
  generateToken,
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  type AuthenticatedRequest,
} from '../middleware/jwtAuth.js';
import { Role } from '../middleware/rbac.js';
import { verifyUser } from '../services/userService.js';

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
    res.status(401).json({
      success: false,
      error: { code: 'MISSING_API_KEY', message: '缺少 apiKey' },
    });
    return;
  }

  // 常量时间比较防时序攻击
  if (apiKey.length > 128 || apiKey.length !== config.ADMIN_API_KEY.length) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_API_KEY', message: 'API Key 无效' },
    });
    return;
  }

  const a = Buffer.from(apiKey, 'utf-8');
  const b = Buffer.from(config.ADMIN_API_KEY, 'utf-8');
  if (!timingSafeEqual(a, b)) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_API_KEY', message: 'API Key 无效' },
    });
    return;
  }

  // 验证通过，签发 token 对
  const userId = 'api-key-user';
  const role = Role.ADMIN;
  const accessToken = await generateToken(userId, role);
  const refreshToken = await generateRefreshToken(userId, role);

  logger.info({ userId, role }, '[auth] 登录成功');
  res.json({
    success: true,
    data: { accessToken, refreshToken, role, userId },
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
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_CREDENTIALS', message: '缺少用户名或密码' },
    });
    return;
  }

  // 企业理由：verifyUser 内部使用 argon2id 常量时间比较，
  // 且用户不存在时仍执行哈希运算防止时序攻击
  const user = await verifyUser(username, password);

  if (!user) {
    // 不区分"用户不存在"和"密码错误"，防止用户名枚举
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: '用户名或密码错误' },
    });
    return;
  }

  const accessToken = await generateToken(user.id, user.role);
  const refreshToken = await generateRefreshToken(user.id, user.role);

  logger.info({ userId: user.id, username: user.username, role: user.role }, '[auth] 密码登录成功');
  res.json({
    success: true,
    data: { accessToken, refreshToken, role: user.role, userId: user.id },
  });
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
    res.status(400).json({
      success: false,
      error: { code: 'MISSING_REFRESH_TOKEN', message: '缺少 refreshToken' },
    });
    return;
  }

  const result = await refreshAccessToken(refreshToken);
  if (!result) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh Token 无效或已过期' },
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
router.get('/me', (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: '未认证' },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      userId: req.user.sub,
      role: req.user.role,
      exp: req.user.exp,
    },
  });
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
    `[DEPRECATED] 客户端调用了废弃端点 POST /logout，请迁移到 DELETE /logout。Sunset: ${SUNSET_DATE}`
  );

  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken) {
    await revokeRefreshToken(refreshToken);
    logger.info('[auth] Refresh Token 已撤销');
  }

  res.json({ success: true });
});

export default router;
