import type { Response, NextFunction } from 'express';
import { jwtVerify } from 'jose';
import { trace, type Span } from '@opentelemetry/api';
import { config } from '../config/index.js';
import { sendProblem } from '../utils/errors.js';
import { recordAuthFailure, getRoutePattern } from '../utils/metrics.js';
import { authenticateWithApiKey } from './apiKeyAuth.js';
import { isAccessTokenRevokedForUser, isUserSessionValid } from './tokenStore.js';
import {
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  attachAuthLogContext,
  authLog,
  denyAuth,
  hashUserId,
  type AuthenticatedRequest,
  type JwtPayload,
} from './authShared.js';
import { getOrCachePublicKey, getOrCacheHS256Key } from './jwtSigner.js';

export {
  type AuthenticatedRequest,
  type TenantedRequest,
  type JwtPayload,
  type Role,
  type OrgRole,
  type TenantContext,
  RT_COOKIE,
  hashUserId,
} from './authShared.js';
export { generateToken } from './jwtSigner.js';

export function requireUser(
  req: AuthenticatedRequest,
  res: Response,
): req is AuthenticatedRequest & { user: NonNullable<AuthenticatedRequest['user']> } {
  if (!req.user) {
    sendProblem(res, 401, 'UNAUTHORIZED');
    return false;
  }
  return true;
}

const tracer = trace.getTracer('backtest-platform', '1.0.0');
const VALID_JWT_ROLES = new Set<JwtPayload['role']>(['admin', 'analyst', 'readonly']);

async function validateJwtPayload(
  payload: unknown,
  algorithm: string,
  span: Span,
): Promise<JwtPayload | null> {
  const p = payload as JwtPayload;
  if (!(
    typeof p.sub === 'string' &&
    p.sub.length > 0 &&
    VALID_JWT_ROLES.has(p.role) &&
    typeof p.exp === 'number' &&
    Number.isFinite(p.exp) &&
    typeof p.iat === 'number' &&
    Number.isFinite(p.iat)
  )) {
    span.setAttribute('verify.result', 'failed_missing_claims');
    return null;
  }
  if (await isAccessTokenRevokedForUser(p.sub, p.iat)) {
    span.setAttribute('verify.result', 'failed_revoked');
    return null;
  }
  span.setAttribute('verify.algorithm', algorithm);
  span.setAttribute('verify.result', 'success');
  return p;
}
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  return tracer.startActiveSpan('jwt.verifyJwt', async (span) => {
    try {
      // A3：JWT_ALGORITHM 已在 env 层枚举校验（非法值启动即抛），此处直接使用，不再静默兜底
      const alg: 'RS256' | 'HS256' = config.JWT_ALGORITHM;
      const key = alg === 'RS256' ? await getOrCachePublicKey() : await getOrCacheHS256Key();
      let payload: JwtPayload;
      try {
        ({ payload } = await jwtVerify(token, key, { algorithms: [alg] }));
      } catch {
        span.setAttribute('verify.result', 'failed');
        return null;
      }
      // validateJwtPayload 内的 Redis/DB 异常不得吞成 401，须向上传播触发 503（authenticateWithBearer catch）
      return validateJwtPayload(payload, alg, span);
    } finally {
      span.end();
    }
  });
}

function tryDevBypass(req: AuthenticatedRequest, next: NextFunction): boolean {
  if (!(
    config.NODE_ENV === 'development' &&
    config.DEV_SKIP_AUTH &&
    config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production'
  ))
    return false;
  authLog('info', 'jwtAuth', req, '开发旁路认证（analyst）');
  const now = Math.floor(Date.now() / 1000);
  req.user = {
    sub: 'dev-user',
    role: 'analyst',
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRES_IN_SEC,
  };
  attachAuthLogContext(req);
  next();
  return true;
}
async function denyIfRevokedOrDisabled(
  payload: JwtPayload,
  req: AuthenticatedRequest,
  res: Response,
  middleware: string,
): Promise<boolean> {
  const uid = hashUserId(payload.sub);
  // 吊销已在 validateJwtPayload 检查，此处只查账号停用
  if (!(await isUserSessionValid(payload.sub))) {
    denyAuth(req, res, 'ACCOUNT_DISABLED', '用户已停用，拒绝访问', {
      middleware,
      failureCode: 'account_disabled',
      extra: { userId: uid },
    });
    return true;
  }
  return false;
}
const bearerToken = (req: AuthenticatedRequest): string =>
  req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : '';
async function authenticateWithBearer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  optional: boolean,
): Promise<void> {
  const middleware = optional ? 'optionalJwtAuth' : 'jwtAuth';
  let payload: JwtPayload | null;
  try {
    const token = bearerToken(req);
    payload = token ? await verifyToken(token) : null;
  } catch (err) {
    // P0-02：token 校验基础设施（Redis）故障时 fail-closed 拒绝，而非升级为进程崩溃（unhandledRejection → exit）
    authLog('error', middleware, req, '令牌校验基础设施异常，fail-closed 拒绝', { err });
    recordAuthFailure(getRoutePattern(req), 'session_check_error');
    sendProblem(res, 503, 'AUTH_SERVICE_UNAVAILABLE', 'Authentication Service Unavailable');
    return;
  }
  if (!payload) {
    if (optional) {
      req.user = null;
      authLog('warn', middleware, req, 'JWT 认证失败，可选认证放行', {
        error: 'JWT token 无效或已过期',
      });
      next();
      return;
    }
    denyAuth(req, res, 'INVALID_TOKEN', 'JWT token 无效或已过期', {
      middleware,
      failureCode: 'invalid_token',
    });
    return;
  }
  try {
    if (await denyIfRevokedOrDisabled(payload, req, res, middleware)) return;
  } catch (err) {
    // P0-02：会话状态校验基础设施故障时 fail-closed 拒绝，而非升级为进程崩溃
    authLog('error', middleware, req, '会话状态校验异常，fail-closed 拒绝', {
      err,
      userId: hashUserId(payload.sub),
    });
    recordAuthFailure(getRoutePattern(req), 'session_check_error');
    sendProblem(res, 503, 'AUTH_SERVICE_UNAVAILABLE', 'Authentication Service Unavailable');
    return;
  }
  req.user = payload;
  attachAuthLogContext(req);
  authLog('info', middleware, req, 'JWT 认证通过', {
    userId: hashUserId(req.user?.sub),
    role: req.user?.role,
  });
  next();
}
async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  optional: boolean,
): Promise<void> {
  const middleware = optional ? 'optionalJwtAuth' : 'jwtAuth';
  authLog('info', middleware, req, optional ? '可选 JWT 认证检查' : 'JWT 认证检查', {
    method: req.method,
  });
  if (!optional && tryDevBypass(req, next)) return;
  if (req.headers.authorization?.startsWith('Bearer '))
    return authenticateWithBearer(req, res, next, optional);
  if (optional || req.headers['x-api-key']) return authenticateWithApiKey(req, res, next, optional);
  denyAuth(req, res, 'MISSING_CREDENTIALS', '缺少认证凭证', {
    middleware,
    failureCode: 'missing_credentials',
  });
}
export function jwtAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  void authenticate(req, res, next, false);
}
export function optionalJwtAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  void authenticate(req, res, next, true);
}
export function assignGuestReadonly(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    const now = Math.floor(Date.now() / 1000);
    req.user = { sub: 'guest', role: 'readonly', iat: now, exp: now + ACCESS_TOKEN_EXPIRES_IN_SEC };
    attachAuthLogContext(req);
  }
  next();
}

export {
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserSessions,
} from './tokenStore.js';
