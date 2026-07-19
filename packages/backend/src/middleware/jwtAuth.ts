/**
 * JWT / OIDC 认证中间件 — 统一入口（含验证实现）。
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
 * 本文件为认证中间件统一入口，承载 JWT 验证与 Express 中间件实现，
 * 并 re-export jwtSigner / refreshToken 子模块的公开接口。
 */

import { jwtVerify } from 'jose';
import { trace, type Span } from '@opentelemetry/api';
import type { Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { recordAuthFailure } from '../utils/metrics.js';
import {
  type AuthenticatedRequest,
  type JwtPayload,
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  attachAuthLogContext,
  hashUserId,
} from './authTypes.js';
import { tryDevBypass } from './devBypass.js';
import { handleApiKeyAuth, handleOptionalApiKey } from './apiKeyAuth.js';
import { getOrCachePublicKey, getOrCacheHS256Key } from './jwtSigner.js';
import { isAccessTokenRevokedForUser, isUserSessionValid } from './refreshToken.js';

// 为向后兼容重新导出类型
export type { AuthenticatedRequest, TenantedRequest, TenantContext } from './authTypes.js';

// 重新导出子模块公开接口
export { generateToken } from './jwtSigner.js';
export {
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserSessions,
} from './refreshToken.js';

/** OTel tracer（无 SDK 初始化时返回 NoopTracer，不影响测试与运行） */
const tracer = trace.getTracer('backtest-platform', '1.0.0');

// ---------------------------------------------------------------------------
// 配置常量
// ---------------------------------------------------------------------------

/** JWT 签名算法（从集中配置读取，RS256 或 HS256） */
const JWT_ALGORITHM = config.JWT_ALGORITHM;

// ---------------------------------------------------------------------------
// JWT 验证
// ---------------------------------------------------------------------------

/** 合法角色集合，用于拒绝伪造或缺失的 role 声明 */
const VALID_JWT_ROLES = new Set<JwtPayload['role']>(['admin', 'analyst', 'readonly']);

/**
 * 校验 JWT payload 是否包含全部必需声明且类型合法（RFC 8725）。
 * jose 的 jwtVerify 只校验签名与 alg，不强制自定义声明；缺失 exp 令牌永不过期、
 * 缺 sub 用户维度鉴权/审计失效、缺/伪造 role 导致 RBAC 越权。必须显式拒绝。
 *
 * @param payload - jwtVerify 解码后的 payload
 * @returns 声明齐备且合法返回 true，否则 false
 */
function hasRequiredClaims(payload: JwtPayload): boolean {
  return (
    typeof payload.sub === 'string' &&
    payload.sub.length > 0 &&
    VALID_JWT_ROLES.has(payload.role) &&
    typeof payload.exp === 'number' &&
    Number.isFinite(payload.exp)
  );
}

/**
 * 校验 JWT payload 声明并检查会话吊销状态。RS256 与 HS256 两条验证路径共用此逻辑。
 *
 * @param payload - jwtVerify 解码后的原始 payload
 * @param algorithm - 验证通过的算法名，用于 OTel span 属性
 * @param span - 当前 OTel span
 * @returns 声明齐备且会话有效返回 JwtPayload，否则 null
 */
async function validateJwtPayload(
  payload: unknown,
  algorithm: string,
  span: Span,
): Promise<JwtPayload | null> {
  const jwtPayload = payload as unknown as JwtPayload;
  if (!hasRequiredClaims(jwtPayload)) {
    span.setAttribute('verify.result', 'failed_missing_claims');
    return null;
  }
  if (await isAccessTokenRevokedForUser(jwtPayload.sub, jwtPayload.iat)) {
    span.setAttribute('verify.result', 'failed_revoked');
    return null;
  }
  span.setAttribute('verify.algorithm', algorithm);
  span.setAttribute('verify.result', 'success');
  return jwtPayload;
}

/**
 * 验证并解码 JWT。先尝试 RS256，失败后仅在配置为 HS256 时回退 HS256。
 * jose 的 jwtVerify 强制校验 alg 声明自动拒绝 alg:none 令牌；
 * 验证通过后还须经 hasRequiredClaims 校验 sub/role/exp 声明。
 *
 * @param token - JWT 字符串
 * @returns 解码后的 payload，验证失败返回 null
 */
async function verifyJwt(token: string): Promise<JwtPayload | null> {
  return tracer.startActiveSpan('jwt.verifyJwt', async (span) => {
    try {
      // 1. 先尝试 RS256 验证
      try {
        const publicKey = await getOrCachePublicKey();
        const { payload } = await jwtVerify(token, publicKey, {
          algorithms: ['RS256'],
        });
        return validateJwtPayload(payload, 'RS256', span);
      } catch {
        // RS256 验证失败，按策略决定是否回退 HS256
      }

      // 2. 回退 HS256 验证（仅在显式启用 HS256 时）
      // Security (RFC 8725 §3.1)：禁止"先 RS256 再无条件 HS256"双算法接受策略，
      // 防止算法混淆攻击（用 RS256 公钥作 HS256 对称密钥伪造）与 JWT_SECRET 偏弱时离线爆破。
      // 仅当配置算法本身为 HS256（开发/显式过渡）时才尝试；生产默认 RS256，HS256 通道关闭。
      if (JWT_ALGORITHM !== 'HS256') {
        span.setAttribute('verify.result', 'failed');
        return null;
      }
      try {
        const key = await getOrCacheHS256Key();
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
        });
        return validateJwtPayload(payload, 'HS256', span);
      } catch {
        span.setAttribute('verify.result', 'failed');
        return null;
      }
    } finally {
      span.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Token 验证（公开接口）
// ---------------------------------------------------------------------------

/**
 * 验证 Access Token，返回解码后的 payload
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  return verifyJwt(token);
}

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
 * 3. 开发环境（NODE_ENV !== 'production'）→ 跳过认证
 */

/** 检查 JWT payload 对应的会话是否有效（未撤销、用户未停用）。返回错误码或 null。 */
async function checkSessionValidity(
  payload: JwtPayload,
  req: AuthenticatedRequest,
): Promise<string | null> {
  if (await isAccessTokenRevokedForUser(payload.sub, payload.iat)) {
    logger.warn(
      { middleware: 'jwtAuth', path: req.path, userId: hashUserId(payload.sub), requestId: req.id },
      '[jwtAuth] 会话已全局撤销，拒绝访问',
    );
    recordAuthFailure(req.path, 'session_revoked');
    return 'SESSION_REVOKED';
  }
  if (!(await isUserSessionValid(payload.sub))) {
    logger.warn(
      { middleware: 'jwtAuth', path: req.path, userId: hashUserId(payload.sub), requestId: req.id },
      '[jwtAuth] 用户已停用，拒绝访问',
    );
    recordAuthFailure(req.path, 'account_disabled');
    return 'ACCOUNT_DISABLED';
  }
  return null;
}

/** 处理 Bearer Token 认证流程（含吊销/停用检查） */
function handleBearerTokenAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    recordAuthFailure(req.path, 'missing_credentials');
    sendProblem(res, 401, 'MISSING_CREDENTIALS', 'Unauthorized', {
      detail: '缺少认证凭证',
    });
    return;
  }
  const token = authHeader.slice(7).trim();
  verifyJwt(token)
    .then(async (payload) => {
      if (!payload) {
        logger.warn(
          {
            middleware: 'jwtAuth',
            path: req.path,
            error: 'JWT token 无效或已过期',
            requestId: req.id,
          },
          '[jwtAuth] JWT 认证失败',
        );
        recordAuthFailure(req.path, 'invalid_token');
        sendProblem(res, 401, 'INVALID_TOKEN', 'Unauthorized', {
          detail: 'JWT token 无效或已过期',
        });
        return;
      }
      const sessionError = await checkSessionValidity(payload, req);
      if (sessionError) {
        sendProblem(res, 401, sessionError, 'Unauthorized', {
          detail:
            sessionError === 'SESSION_REVOKED' ? '会话已失效，请重新登录' : '账户已停用或已删除',
        });
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
    })
    .catch((err) => {
      logger.warn(
        { middleware: 'jwtAuth', path: req.path, error: String(err), requestId: req.id },
        '[jwtAuth] JWT 验证异常',
      );
      recordAuthFailure(req.path, 'invalid_token');
      sendProblem(res, 401, 'INVALID_TOKEN', 'Unauthorized', { detail: 'JWT token 无效或已过期' });
    });
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
  sendProblem(res, 401, 'MISSING_CREDENTIALS', 'Unauthorized', {
    detail: '缺少认证凭证，请提供 Bearer Token 或 x-api-key',
  });
}

/**
 * 可选 JWT 认证中间件。部分端点（如回测执行）需识别用户身份但不强制要求认证，
 * 未认证用户以 readonly 角色访问。权衡：可选认证降低安全门槛，但渐进式引入比一刀切更可行。
 */
/** 可选模式：处理 Bearer Token，失败时匿名放行 */
function handleOptionalBearer(req: AuthenticatedRequest, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = authHeader.slice(7).trim();
  verifyJwt(token)
    .then((payload) => {
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
    })
    .catch(() => {
      req.user = null;
      logger.warn(
        { middleware: 'optionalJwtAuth', path: req.path, error: 'JWT 验证异常', requestId: req.id },
        '[jwtAuth] JWT 认证失败，可选认证放行',
      );
      next();
    });
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
 * 使数据引擎只读端点（stats/status/tickers）在开发环境无需登录即可访问。
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
