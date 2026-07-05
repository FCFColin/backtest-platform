/**
 * JWT 验证模块
 *
 * 职责：JWT 验证、payload 校验、Express 认证中间件。
 * 从 jwtAuth.ts 拆分而来，保持原有逻辑不变。
 */

import { jwtVerify } from 'jose';
import type { Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
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
 * 校验 JWT payload 是否包含全部必需声明且类型合法。
 *
 * 企业理由（Security / RFC 8725）：jose 的 jwtVerify 只校验签名与 alg，
 * 不强制要求自定义声明存在。若放行缺失声明的令牌将导致：
 * - 缺 exp：令牌永不过期，无法通过到期吊销；
 * - 缺 sub：下游 user.sub 为 undefined，用户维度的鉴权与审计失效；
 * - 缺/伪造 role：RBAC 角色判定异常，可能越权。
 * 因此必须显式拒绝缺失或非法声明的令牌。
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
 * 验证并解码 JWT
 *
 * 企业理由：验证时先尝试 RS256，失败后回退 HS256，确保迁移期间
 * 新旧令牌均可验证。jose 库的 jwtVerify 强制校验 alg 声明，
 * 自动拒绝 alg:none 令牌，从根本上防御算法混淆攻击。
 * 验证通过后还须经 hasRequiredClaims 校验 sub/role/exp 声明，
 * 拒绝缺失关键声明的"半合法"令牌。
 *
 * @param token - JWT 字符串
 * @returns 解码后的 payload，验证失败返回 null
 */
async function verifyJwt(token: string): Promise<JwtPayload | null> {
  // 1. 先尝试 RS256 验证
  try {
    const publicKey = await getOrCachePublicKey();
    const { payload } = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
    });
    const jwtPayload = payload as unknown as JwtPayload;
    if (!hasRequiredClaims(jwtPayload)) {
      return null;
    }
    if (await isAccessTokenRevokedForUser(jwtPayload.sub, jwtPayload.iat)) {
      return null;
    }
    return jwtPayload;
  } catch {
    // RS256 验证失败，按策略决定是否回退 HS256
  }

  // 2. 回退 HS256 验证（仅在显式启用 HS256 时）
  //
  // Security (ADR：T-05 / RFC 8725 §3.1)：禁止"先 RS256 再无条件 HS256"的双算法接受策略。
  // 企业为何需要：若服务端同时接受 RS256 与 HS256，攻击者可用服务端 RS256 公钥作为 HS256 的
  //   对称密钥伪造令牌（算法混淆攻击）；或在 JWT_SECRET 偏弱时离线爆破伪造 HS256 令牌。
  // 做法：仅当配置算法本身为 HS256（开发/显式过渡）时才尝试 HS256；生产默认 RS256，HS256 通道关闭。
  // 权衡：若需 HS256→RS256 迁移期同时验证两类令牌，应通过显式临时开关而非默认行为。
  if (JWT_ALGORITHM !== 'HS256') {
    return null;
  }
  try {
    const key = await getOrCacheHS256Key();
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    const jwtPayload = payload as unknown as JwtPayload;
    if (!hasRequiredClaims(jwtPayload)) {
      return null;
    }
    if (await isAccessTokenRevokedForUser(jwtPayload.sub, jwtPayload.iat)) {
      return null;
    }
    return jwtPayload;
  } catch {
    return null;
  }
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
 * JWT 认证中间件
 *
 * 企业理由：统一认证入口，支持 Bearer Token 和 x-api-key 两种模式，
 * 兼顾安全升级（JWT）和现有系统兼容（API Key）。
 *
 * 认证优先级：
 * 1. Authorization: Bearer <token> → JWT 验证
 * 2. x-api-key header → 兼容旧 API Key 模式
 * 3. 开发环境（NODE_ENV !== 'production'）→ 跳过认证
 *
 * 权衡：双模式增加了中间件复杂度，但避免了迁移期的认证中断。
 * 生产环境应逐步废弃 x-api-key，仅保留 JWT。
 */

/** 处理 Bearer Token 认证流程（含吊销/停用检查） */
function handleBearerTokenAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization!.slice(7).trim();
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
        sendProblem(res, 401, 'INVALID_TOKEN', 'Unauthorized', {
          detail: 'JWT token 无效或已过期',
        });
        return;
      }
      if (await isAccessTokenRevokedForUser(payload.sub, payload.iat)) {
        logger.warn(
          {
            middleware: 'jwtAuth',
            path: req.path,
            userId: hashUserId(payload.sub),
            requestId: req.id,
          },
          '[jwtAuth] 会话已全局撤销，拒绝访问',
        );
        sendProblem(res, 401, 'SESSION_REVOKED', 'Unauthorized', {
          detail: '会话已失效，请重新登录',
        });
        return;
      }
      if (!(await isUserSessionValid(payload.sub))) {
        logger.warn(
          {
            middleware: 'jwtAuth',
            path: req.path,
            userId: hashUserId(payload.sub),
            requestId: req.id,
          },
          '[jwtAuth] 用户已停用，拒绝访问',
        );
        sendProblem(res, 401, 'ACCOUNT_DISABLED', 'Unauthorized', { detail: '账户已停用或已删除' });
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
  sendProblem(res, 401, 'MISSING_CREDENTIALS', 'Unauthorized', {
    detail: '缺少认证凭证，请提供 Bearer Token 或 x-api-key',
  });
}

/**
 * 可选 JWT 认证中间件
 *
 * 企业理由：部分端点（如回测执行）需要识别用户身份但不强制要求认证，
 * 未认证用户以 readonly 角色访问。
 * 权衡：可选认证降低了安全门槛，但渐进式引入比一刀切更可行。
 */
/** 可选模式：处理 Bearer Token，失败时匿名放行 */
function handleOptionalBearer(req: AuthenticatedRequest, next: NextFunction): void {
  const token = req.headers.authorization!.slice(7).trim();
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
