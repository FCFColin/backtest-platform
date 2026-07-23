/**
 * JWT / OIDC 认证中间件 — 统一入口。
 *
 * API Key 是静态凭证，泄露后无法撤销且无法区分用户身份；JWT 提供有状态会话管理
 * （过期、刷新、角色嵌入），是企业级 SaaS 认证标准。保留 x-api-key 兼容模式（ADR-033）
 * 确保自动化脚本/内部工具无需立即迁移。
 *
 * 使用 jose 库替代自实现 HMAC-SHA256：
 * - alg=none 攻击防护：jose 强制校验 alg 声明，拒绝 alg:none 令牌；
 * - OIDC/SSO 支持：jose 支持 JWK Set/x5c 证书链，为集成企业 IdP（Okta/Azure AD）奠定基础；
 * - RS256 非对称密钥：私钥签名、公钥验证，支持密钥轮换与安全分发（HS256 共享密钥泄露面大）。
 *
 * 权衡：jose 增加依赖但符合 JOSE 规范且零原生依赖；保留 HS256 向后兼容路径；
 * Refresh Token 存储于 Redis（含内存回退）支持多实例与 Token Family 复用检测；
 * 开发环境跳过认证便于本地调试，生产须确保不误配。
 *
 * 本文件聚焦 Express 中间件编排（jwtAuth / optionalJwtAuth / assignGuestReadonly / assignGuestAnalyst），
 * JWT 验证逻辑（verifyJwt、声明校验、RS256/HS256 回退）抽至 ./jwtVerify.ts，
 * 避免单文件混合验证实现与中间件编排（ADR-013 单一职责）。
 */

import type { Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { recordAuthFailure } from '../utils/metrics.js';
import {
  type AuthenticatedRequest,
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  attachAuthLogContext,
  hashUserId,
} from './authTypes.js';
import { tryDevBypass } from './devBypass.js';
import { handleApiKeyAuth, handleOptionalApiKey } from './apiKeyAuth.js';
import { isAccessTokenRevokedForUser, isUserSessionValid } from './refreshToken.js';
import { verifyToken } from './jwtVerify.js';

// 为向后兼容重新导出类型
export type { AuthenticatedRequest, TenantedRequest, TenantContext } from './authTypes.js';

// 重新导出子模块公开接口（含从 jwtVerify.ts 抽出的 verifyToken）
export { generateToken } from './jwtSigner.js';
export {
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserSessions,
} from './refreshToken.js';
export { verifyToken } from './jwtVerify.js';

// ---------------------------------------------------------------------------
// Express 中间件
// ---------------------------------------------------------------------------

/**
 * JWT 认证中间件。统一认证入口，支持 Bearer Token 和 x-api-key 两种模式。
 *
 * x-api-key (per-org, ADR-033) 与 JWT 并存——API Key 按组织隔离、哈希存储、可吊销、可审计，
 * 是服务间与 CLI 集成首选；JWT 面向浏览器交互会话。
 *
 * 认证优先级：
 * 1. Authorization: Bearer <token> → JWT 验证
 * 2. x-api-key header → per-org API Key 验证（ADR-033）
 * 3. 开发环境（NODE_ENV=development + DEV_SKIP_AUTH=true + 默认 JWT_SECRET）→ 注入 readonly 用户
 */

/** 处理 Bearer Token 认证流程（含吊销/停用检查） */
async function handleBearerTokenAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const payload = token ? await verifyToken(token) : null;
  if (!payload) {
    logger.warn(
      { middleware: 'jwtAuth', path: req.path, error: 'JWT token 无效或已过期', requestId: req.id },
      '[jwtAuth] JWT 认证失败',
    );
    recordAuthFailure(req.path, 'invalid_token');
    sendProblem(res, 401, 'INVALID_TOKEN');
    return;
  }
  if (await isAccessTokenRevokedForUser(payload.sub, payload.iat)) {
    logger.warn(
      { middleware: 'jwtAuth', path: req.path, userId: hashUserId(payload.sub), requestId: req.id },
      '[jwtAuth] 会话已全局撤销，拒绝访问',
    );
    recordAuthFailure(req.path, 'session_revoked');
    sendProblem(res, 401, 'SESSION_REVOKED');
    return;
  }
  if (!(await isUserSessionValid(payload.sub))) {
    logger.warn(
      { middleware: 'jwtAuth', path: req.path, userId: hashUserId(payload.sub), requestId: req.id },
      '[jwtAuth] 用户已停用，拒绝访问',
    );
    recordAuthFailure(req.path, 'account_disabled');
    sendProblem(res, 401, 'ACCOUNT_DISABLED');
    return;
  }
  req.user = payload;
  attachAuthLogContext(req);
  logger.info(
    {
      middleware: 'jwtAuth',
      path: req.path,
      userId: hashUserId(req.user?.sub),
      role: req.user?.role,
      requestId: req.id,
    },
    '[jwtAuth] JWT 认证通过',
  );
  next();
}

export function jwtAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  logger.info(
    { middleware: 'jwtAuth', path: req.path, method: req.method, requestId: req.id },
    '[jwtAuth] JWT 认证检查',
  );

  if (tryDevBypass(req, next)) return;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    handleBearerTokenAuth(req, res, next);
    return;
  }

  if (req.headers['x-api-key']) {
    handleApiKeyAuth(req, res, next);
    return;
  }

  logger.warn(
    { middleware: 'jwtAuth', path: req.path, error: '缺少认证凭证', requestId: req.id },
    '[jwtAuth] JWT 认证失败',
  );
  recordAuthFailure(req.path, 'missing_credentials');
  sendProblem(res, 401, 'MISSING_CREDENTIALS');
}

/**
 * 可选 JWT 认证中间件。部分端点（如回测执行）需识别用户身份但不强制要求认证，
 * 未认证用户以 readonly 角色访问。权衡：可选认证降低安全门槛，但渐进式引入比一刀切更可行。
 */
/** 可选模式：处理 Bearer Token，失败时匿名放行 */
async function handleOptionalBearer(req: AuthenticatedRequest, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const payload = token ? await verifyToken(token) : null;
  if (payload) {
    req.user = payload;
    attachAuthLogContext(req);
    logger.info(
      {
        middleware: 'optionalJwtAuth',
        path: req.path,
        userId: hashUserId(req.user?.sub),
        role: req.user?.role,
        requestId: req.id,
      },
      '[jwtAuth] JWT 认证通过',
    );
  } else {
    req.user = null;
    logger.warn(
      {
        middleware: 'optionalJwtAuth',
        path: req.path,
        error: 'JWT token 无效或已过期',
        requestId: req.id,
      },
      '[jwtAuth] JWT 认证失败，可选认证放行',
    );
  }
  next();
}

export function optionalJwtAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  logger.info(
    { middleware: 'optionalJwtAuth', path: req.path, method: req.method, requestId: req.id },
    '[jwtAuth] 可选 JWT 认证检查',
  );
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    handleOptionalBearer(req, next);
  } else {
    handleOptionalApiKey(req, next);
  }
}

/**
 * 为未认证请求注入 readonly 访客身份。
 *
 * 配合 optionalJwtAuth + requirePermission(DATA_READ) 使用，
 * 使数据引擎只读端点（stats/status/tickers）无需登录即可访问。
 */
export function assignGuestReadonly(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    req.user = {
      sub: 'guest',
      role: 'readonly',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRES_IN_SEC,
    };
    attachAuthLogContext(req);
  }
  next();
}

/**
 * 为未认证请求注入 analyst 访客身份。
 *
 * 平台当前无付费内容，所有计算功能（回测/优化/战术/信号/分析等）对匿名用户开放。
 * 已登录用户的真实身份优先保留，仅对未认证请求注入 guest（analyst 角色）。
 * analyst 角色具备全部计算权限（BACKTEST_RUN / OPTIMIZER_RUN / STRATEGY_MANAGE 等），
 * 但无 ADMIN_ACCESS，且不绑定租户上下文（enforceQuota 对无 tenantId 自动放行）。
 *
 * 未来引入付费墙时，应在此处或路由层添加计划校验逻辑。
 */
export function assignGuestAnalyst(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    req.user = {
      sub: 'guest',
      role: 'analyst',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRES_IN_SEC,
    };
    attachAuthLogContext(req);
  }
  next();
}
