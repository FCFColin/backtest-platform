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

export function hashUserId(sub: string | undefined): string | undefined {
  return sub ? crypto.createHash('sha256').update(sub).digest('hex').slice(0, 16) : undefined;
}

type LoggableRequest = AuthenticatedRequest & {
  log?: {
    child: (b: Record<string, unknown>) => { child: (b: Record<string, unknown>) => unknown };
  };
};
export function attachAuthLogContext(req: AuthenticatedRequest): void {
  const sub = req.user?.sub;
  if (!sub) return;
  const reqWithLog = req as LoggableRequest;
  if (reqWithLog.log && typeof reqWithLog.log.child === 'function')
    reqWithLog.log = reqWithLog.log.child({
      user_id: hashUserId(sub),
      role: req.user?.role,
    }) as typeof reqWithLog.log;
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

export function authCtx(middleware: string, req: AuthenticatedRequest): Record<string, unknown> {
  return { middleware, path: req.path, requestId: req.id };
}

type AuthLogLevel = 'info' | 'warn' | 'error';
function authLog(
  level: AuthLogLevel,
  middleware: string,
  req: AuthenticatedRequest,
  msg: string,
  extra: Record<string, unknown> = {},
): void {
  logger[level]({ ...authCtx(middleware, req), ...extra }, `[jwtAuth] ${msg}`);
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
async function getPrivateKey(): Promise<JoseKey> {
  if (config.JWT_PRIVATE_KEY) return importPKCS8(config.JWT_PRIVATE_KEY, 'RS256');
  if (config.JWT_PRIVATE_KEY_FILE)
    return importPKCS8(readPemFile(config.JWT_PRIVATE_KEY_FILE), 'RS256');
  if (config.NODE_ENV !== 'production') return (await generateDevKeyPair()).privateKey;
  throw new Error('RS256 模式下必须配置 JWT_PRIVATE_KEY 或 JWT_PRIVATE_KEY_FILE');
}
async function getPublicKey(): Promise<JoseKey> {
  if (config.JWT_PUBLIC_KEY) return importSPKI(config.JWT_PUBLIC_KEY, 'RS256');
  if (config.JWT_PUBLIC_KEY_FILE)
    return importSPKI(readPemFile(config.JWT_PUBLIC_KEY_FILE), 'RS256');
  if (config.NODE_ENV !== 'production') return (await generateDevKeyPair()).publicKey;
  throw new Error('RS256 模式下必须配置 JWT_PUBLIC_KEY 或 JWT_PUBLIC_KEY_FILE');
}
function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function getHS256Key(): Promise<JoseKey> {
  return importJWK({ kty: 'oct', k: base64urlEncode(JWT_SECRET) }, 'HS256');
}
function memoizeKey<T>(loader: () => Promise<T>): () => Promise<T> {
  let cached: T | null = null;
  return async () => {
    if (cached === null) cached = await loader();
    return cached;
  };
}
export const getOrCachePrivateKey = memoizeKey(getPrivateKey);
export const getOrCachePublicKey = memoizeKey(getPublicKey);
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
  const payload: JwtPayload = {
    sub: userId,
    role,
    iat: now,
    exp: now + (ROLE_TTL[role] || config.JWT_ACCESS_TTL),
  };
  if (tenant?.tenantId) payload.tenant_id = tenant.tenantId;
  if (tenant?.orgRole) payload.org_role = tenant.orgRole;
  if (tenant?.platformAdmin) payload.platform_admin = true;
  return signConfiguredJwt(payload);
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
async function verifyJwt(token: string): Promise<JwtPayload | null> {
  return tracer.startActiveSpan('jwt.verifyJwt', async (span) => {
    try {
      let payload: JwtPayload | null = null;
      try {
        payload = await verifyWithAlgorithm(token, 'RS256', span);
      } catch {
        /* try next algorithm */
      }
      if (!payload && JWT_ALGORITHM === 'HS256') {
        try {
          payload = await verifyWithAlgorithm(token, 'HS256', span);
        } catch {
          /* try next algorithm */
        }
      }
      if (!payload) span.setAttribute('verify.result', 'failed');
      return payload;
    } finally {
      span.end();
    }
  });
}
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  return verifyJwt(token);
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
function authSuccess(middleware: string, req: AuthenticatedRequest, next: NextFunction): void {
  attachAuthLogContext(req);
  authLog('info', middleware, req, 'JWT 认证通过', {
    userId: hashUserId(req.user?.sub),
    role: req.user?.role,
  });
  next();
}

function tryDevBypass(req: AuthenticatedRequest, next: NextFunction): boolean {
  if (!(
    config.NODE_ENV === 'development' &&
    config.DEV_SKIP_AUTH &&
    config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production'
  ))
    return false;
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
  if (await isAccessTokenRevokedForUser(payload.sub, payload.iat)) {
    authLog('warn', middleware, req, '会话已全局撤销，拒绝访问', {
      userId: hashUserId(payload.sub),
    });
    recordAuthFailure(getRoutePattern(req), 'session_revoked');
    sendProblem(res, 401, 'SESSION_REVOKED');
    return true;
  }
  if (!(await isUserSessionValid(payload.sub))) {
    authLog('warn', middleware, req, '用户已停用，拒绝访问', { userId: hashUserId(payload.sub) });
    recordAuthFailure(getRoutePattern(req), 'account_disabled');
    sendProblem(res, 401, 'ACCOUNT_DISABLED');
    return true;
  }
  return false;
}
function bearerToken(req: AuthenticatedRequest): string {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}
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
  authSuccess(middleware, req, next);
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
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    if (optional) {
      void authenticateWithBearer(req, res, next, true).catch((err) => {
        authLog('error', middleware, req, 'handleOptionalBearer unhandled rejection', { err });
        next(err);
      });
      return;
    }
    await authenticateWithBearer(req, res, next, false);
    return;
  }
  if (req.headers['x-api-key']) {
    await authenticateWithApiKey(req, res, next, optional);
    return;
  }
  if (optional) {
    await authenticateWithApiKey(req, res, next, true);
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

export type { RefreshTokenEntry, TokenFamilyEntry } from './tokenStore.js';
export {
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  REFRESH_TOKEN_EXPIRES_IN_SEC,
  REFRESH_TOKEN_PREFIX,
  TOKEN_FAMILY_PREFIX,
  tenantFromEntry,
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
