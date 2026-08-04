import crypto from 'crypto';
import fs from 'fs';
import type { Request, Response, NextFunction } from 'express';
import { SignJWT, generateKeyPair, importPKCS8, importSPKI, importJWK, jwtVerify } from 'jose';
import { trace, type Span } from '@opentelemetry/api';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendProblem, errorMessage } from '../utils/errors.js';
import { recordAuthFailure, getRoutePattern } from '../utils/metrics.js';
import type { OrgRole } from '@backtest/shared/types/org';
import { authenticateWithApiKey } from './apiKeyAuth.js';
import {
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  ROLE_TTL,
  isAccessTokenRevokedForUser,
  isUserSessionValid,
} from './tokenStore.js';

export type { OrgRole };
export type Role = 'admin' | 'analyst' | 'readonly';

export interface TenantContext {
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
}
export interface JwtPayload {
  sub: string;
  role: Role;
  tenant_id?: string;
  org_role?: OrgRole;
  platform_admin?: boolean;
  api_key_id?: string;
  iat: number;
  exp: number;
}
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload | null;
  tenantId?: string;
}
export interface TenantedRequest extends Request {
  user?: JwtPayload | null;
  tenantId: string;
}

export const hashUserId = (sub: string | undefined): string | undefined =>
  sub ? crypto.createHash('sha256').update(sub).digest('hex').slice(0, 16) : undefined;

export function attachAuthLogContext(req: AuthenticatedRequest): void {
  const sub = req.user?.sub;
  if (!sub) return;
  const r = req as AuthenticatedRequest & {
    log?: { child: (b: Record<string, unknown>) => unknown };
  };
  if (r.log?.child)
    r.log = r.log.child({ user_id: hashUserId(sub), role: req.user?.role }) as typeof r.log;
}
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

type AuthLogLevel = 'info' | 'warn' | 'error';
export const authCtx = (
  middleware: string,
  req: AuthenticatedRequest,
): Record<string, unknown> => ({
  middleware,
  path: req.path,
  requestId: req.id,
});
function authLog(
  level: AuthLogLevel,
  middleware: string,
  req: AuthenticatedRequest,
  msg: string,
  extra: Record<string, unknown> = {},
): void {
  logger[level]({ middleware, path: req.path, requestId: req.id, ...extra }, `[jwtAuth] ${msg}`);
}

type JoseKey = Exclude<Awaited<ReturnType<typeof importPKCS8>>, Uint8Array> | Uint8Array;
const JWT_SECRET = config.JWT_SECRET;
const JWT_ALGORITHM = config.JWT_ALGORITHM;
let devKeyPair: { privateKey: JoseKey; publicKey: JoseKey } | null = null;

async function generateDevKeyPair(): Promise<{ privateKey: JoseKey; publicKey: JoseKey }> {
  if (devKeyPair) return devKeyPair;
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  devKeyPair = { publicKey, privateKey };
  logger.info('[jwtAuth] 已自动生成开发环境 RSA 密钥对（进程重启后失效）');
  return devKeyPair;
}
function readPemFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`无法读取 PEM 文件: ${filePath} - ${errorMessage(err)}`);
  }
}
async function loadKey(type: 'private' | 'public'): Promise<JoseKey> {
  const isPrivate = type === 'private';
  const direct = isPrivate ? config.JWT_PRIVATE_KEY : config.JWT_PUBLIC_KEY;
  const file = isPrivate ? config.JWT_PRIVATE_KEY_FILE : config.JWT_PUBLIC_KEY_FILE;
  const importFn = isPrivate ? importPKCS8 : importSPKI;
  if (direct) return importFn(direct, 'RS256');
  if (file) return importFn(readPemFile(file), 'RS256');
  if (config.NODE_ENV !== 'production') {
    const pair = await generateDevKeyPair();
    return isPrivate ? pair.privateKey : pair.publicKey;
  }
  throw new Error(
    `RS256 模式下必须配置 JWT_${type.toUpperCase()}_KEY 或 JWT_${type.toUpperCase()}_KEY_FILE`,
  );
}
function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const getHS256Key = () => importJWK({ kty: 'oct', k: base64urlEncode(JWT_SECRET) }, 'HS256');
function memoizeKey<T>(loader: () => Promise<T>): () => Promise<T> {
  let cached: T | null = null;
  return async () => {
    if (cached === null) cached = await loader();
    return cached;
  };
}
export const getOrCachePrivateKey = memoizeKey(() => loadKey('private'));
export const getOrCachePublicKey = memoizeKey(() => loadKey('public'));
export const getOrCacheHS256Key = memoizeKey(getHS256Key);

async function signConfiguredJwt(payload: JwtPayload): Promise<string> {
  const isRs256 = JWT_ALGORITHM === 'RS256';
  const key = isRs256 ? await getOrCachePrivateKey() : await getOrCacheHS256Key();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: isRs256 ? 'RS256' : 'HS256' })
    .setIssuedAt(payload.iat)
    .setExpirationTime(payload.exp)
    .sign(key);
}
export async function generateToken(
  userId: string,
  role: Role,
  tenant?: TenantContext,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signConfiguredJwt({
    sub: userId,
    role,
    iat: now,
    exp: now + (ROLE_TTL[role] || config.JWT_ACCESS_TTL),
    ...(tenant?.tenantId && { tenant_id: tenant.tenantId }),
    ...(tenant?.orgRole && { org_role: tenant.orgRole }),
    ...(tenant?.platformAdmin && { platform_admin: true }),
  });
}

const tracer = trace.getTracer('backtest-platform', '1.0.0');
const VALID_JWT_ROLES = new Set<JwtPayload['role']>(['admin', 'analyst', 'readonly']);

async function validateJwtPayload(
  payload: unknown,
  algorithm: string,
  span: Span,
): Promise<JwtPayload | null> {
  const jwtPayload = payload as JwtPayload;
  const ok =
    typeof jwtPayload.sub === 'string' &&
    jwtPayload.sub.length > 0 &&
    VALID_JWT_ROLES.has(jwtPayload.role) &&
    typeof jwtPayload.exp === 'number' &&
    Number.isFinite(jwtPayload.exp);
  if (!ok) {
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
async function verifyWithAlgorithm(
  token: string,
  algorithm: 'RS256' | 'HS256',
  span: Span,
): Promise<JwtPayload | null> {
  const key = algorithm === 'RS256' ? await getOrCachePublicKey() : await getOrCacheHS256Key();
  const { payload } = await jwtVerify(token, key, { algorithms: [algorithm] });
  return validateJwtPayload(payload, algorithm, span);
}
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  return tracer.startActiveSpan('jwt.verifyJwt', async (span) => {
    try {
      const algorithms: ('RS256' | 'HS256')[] = ['RS256'];
      if (JWT_ALGORITHM === 'HS256') algorithms.push('HS256');
      for (const alg of algorithms) {
        try {
          const payload = await verifyWithAlgorithm(token, alg, span);
          if (payload) return payload;
        } catch {
          /* expected: try next algorithm */
        }
      }
      span.setAttribute('verify.result', 'failed');
      return null;
    } finally {
      span.end();
    }
  });
}

export function authFail(
  middleware: string,
  req: AuthenticatedRequest,
  error: string,
  failureCode?: string,
): void {
  authLog('warn', middleware, req, 'JWT 认证失败', { error });
  if (failureCode) recordAuthFailure(getRoutePattern(req), failureCode);
}
function tryDevBypass(req: AuthenticatedRequest, next: NextFunction): boolean {
  const devOk =
    config.NODE_ENV === 'development' &&
    config.DEV_SKIP_AUTH &&
    config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production';
  if (!devOk) return false;
  authLog('info', 'jwtAuth', req, '开发旁路认证（readonly）');
  const now = Math.floor(Date.now() / 1000);
  req.user = {
    sub: 'dev-user',
    role: 'readonly',
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
  const checks: Array<{
    denied: () => Promise<boolean>;
    metric: string;
    code: string;
    msg: string;
  }> = [
    {
      denied: () => isAccessTokenRevokedForUser(payload.sub, payload.iat),
      metric: 'session_revoked',
      code: 'SESSION_REVOKED',
      msg: '会话已全局撤销，拒绝访问',
    },
    {
      denied: async () => !(await isUserSessionValid(payload.sub)),
      metric: 'account_disabled',
      code: 'ACCOUNT_DISABLED',
      msg: '用户已停用，拒绝访问',
    },
  ];
  for (const c of checks) {
    if (await c.denied()) {
      authLog('warn', middleware, req, c.msg, { userId: hashUserId(payload.sub) });
      recordAuthFailure(getRoutePattern(req), c.metric);
      sendProblem(res, 401, c.code);
      return true;
    }
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
  const token = bearerToken(req);
  const payload = token ? await verifyToken(token) : null;
  if (!payload) {
    if (optional) {
      req.user = null;
      authLog('warn', middleware, req, 'JWT 认证失败，可选认证放行', {
        error: 'JWT token 无效或已过期',
      });
      next();
      return;
    }
    authFail(middleware, req, 'JWT token 无效或已过期', 'invalid_token');
    sendProblem(res, 401, 'INVALID_TOKEN');
    return;
  }
  try {
    if (await denyIfRevokedOrDisabled(payload, req, res, middleware)) return;
  } catch (err) {
    if (!optional) throw err;
    authLog('warn', middleware, req, '会话状态校验异常，fail-closed 拒绝（可选认证路径）', {
      userId: hashUserId(payload.sub),
    });
    recordAuthFailure(getRoutePattern(req), 'session_check_error');
    sendProblem(res, 401, 'AUTH_CHECK_FAILED');
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
  if (req.headers.authorization?.startsWith('Bearer ')) {
    await authenticateWithBearer(req, res, next, optional);
    return;
  }
  if (optional || req.headers['x-api-key']) {
    await authenticateWithApiKey(req, res, next, optional);
    return;
  }
  authFail(middleware, req, '缺少认证凭证', 'missing_credentials');
  sendProblem(res, 401, 'MISSING_CREDENTIALS');
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
  isAccessTokenRevokedForUser,
  isUserSessionValid,
} from './tokenStore.js';
export { auditLog, writeOutboxEvent, verifyPayload } from './auditMiddleware.js';
export { idempotencyKey } from './idempotency.js';
export { handleApiKeyAuth, handleOptionalApiKey } from './apiKeyAuth.js';
