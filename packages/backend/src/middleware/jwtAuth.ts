import crypto from 'crypto';
import fs from 'fs';
import type { Request, Response, NextFunction } from 'express';
import { SignJWT, generateKeyPair, importPKCS8, importSPKI, importJWK, jwtVerify } from 'jose';
import { trace, type Span } from '@opentelemetry/api';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendProblem, RedisUnavailableError, errorMessage } from '../utils/errors.js';
import { recordAuthFailure, getRoutePattern } from '../utils/metrics.js';
import type { OrgRole } from '@backtest/shared/types/org';
import { appRedis, getRedisHealth, markRedisUnhealthy } from '../infrastructure/redisClient.js';
import { getUserById } from '../repositories/userRepo.js';
import { requireRedis } from '../utils/redisFallback.js';
import { verifyApiKey } from '../infrastructure/apiKeyVerifier.js';
import type { PoolClient } from 'pg';
import { getPool } from '../db/pool.js';

export type { OrgRole };

export interface TenantContext {
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
}

export interface JwtPayload {
  sub: string;
  role: 'admin' | 'analyst' | 'readonly';
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

export const ACCESS_TOKEN_EXPIRES_IN_SEC = config.JWT_ACCESS_TTL;
export const REFRESH_TOKEN_EXPIRES_IN_SEC = config.JWT_REFRESH_TTL;
export const REFRESH_TOKEN_PREFIX = 'refresh_token:';
export const TOKEN_FAMILY_PREFIX = 'token_family:';

const ROLE_TTL: Record<'admin' | 'analyst' | 'readonly', number> = {
  readonly: config.SESSION_IDLE_TIMEOUT_READONLY_SEC,
  analyst: config.SESSION_IDLE_TIMEOUT_ANALYST_SEC,
  admin: 0,
};

export function getRoleBasedAccessTtl(role: 'admin' | 'analyst' | 'readonly'): number {
  return ROLE_TTL[role] || config.JWT_ACCESS_TTL;
}

export function hashUserId(sub: string | undefined): string | undefined {
  return sub ? crypto.createHash('sha256').update(sub).digest('hex').slice(0, 16) : undefined;
}

export function attachAuthLogContext(req: AuthenticatedRequest): void {
  const sub = req.user?.sub;
  if (!sub) return;
  const reqWithLog = req as AuthenticatedRequest & {
    log?: { child: (b: Record<string, unknown>) => { child: (b: Record<string, unknown>) => unknown } };
  };
  if (reqWithLog.log && typeof reqWithLog.log.child === 'function') {
    reqWithLog.log = reqWithLog.log.child({ user_id: hashUserId(sub), role: req.user?.role }) as typeof reqWithLog.log;
  }
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

export interface RefreshTokenEntry {
  userId: string;
  role: 'admin' | 'analyst' | 'readonly';
  expiresAt: number;
  familyId: string;
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
}

export interface TokenFamilyEntry {
  lastToken: string;
  revoked: boolean;
}

export function tenantFromEntry(entry: RefreshTokenEntry): {
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
} {
  return { tenantId: entry.tenantId, orgRole: entry.orgRole, platformAdmin: entry.platformAdmin };
}

const SYSTEM_USER_IDS = new Set(['dev-user', 'api-key-user']);

export async function isUserSessionValid(userId: string): Promise<boolean> {
  if (SYSTEM_USER_IDS.has(userId)) return true;
  try {
    const user = await getUserById(userId);
    return user !== null && user.isActive;
  } catch (err) {
    logger.warn({ err: String(err), userId }, '[jwtAuth] 用户状态查询失败，拒绝会话');
    return false;
  }
}
export async function generateRefreshToken(
  userId: string,
  role: 'admin' | 'analyst' | 'readonly',
  existingFamilyId?: string,
  tenant?: TenantContext,
): Promise<string> {
  if (!(await getRedisHealth())) {
    throw new RedisUnavailableError(`Redis unavailable (generateRefreshToken:${userId})`);
  }
  const token = crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const familyId = existingFamilyId || crypto.randomBytes(16).toString('hex');
  const ttlSec = REFRESH_TOKEN_EXPIRES_IN_SEC;
  const entry: RefreshTokenEntry = {
    userId, role, expiresAt: now + ttlSec, familyId,
    tenantId: tenant?.tenantId, orgRole: tenant?.orgRole, platformAdmin: tenant?.platformAdmin,
  };
  try {
    await appRedis.set(`${REFRESH_TOKEN_PREFIX}${token}`, JSON.stringify(entry), 'EX', ttlSec);
    const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
    await appRedis.set(familyKey, JSON.stringify({ lastToken: token, revoked: false } satisfies TokenFamilyEntry), 'EX', ttlSec);
    const userFamiliesKey = `user_families:${userId}`;
    await appRedis.sadd(userFamiliesKey, familyId);
    await appRedis.expire(userFamiliesKey, ttlSec);
    logger.info({ userId, familyId }, '[jwtAuth] Redis: Refresh Token 已存储');
  } catch (err) {
    logger.warn({ err: String(err) }, '[jwtAuth] Redis 存储失败，抛出 RedisUnavailableError');
    markRedisUnhealthy();
    throw new RedisUnavailableError(`Redis write failed (generateRefreshToken): ${String(err)}`);
  }
  return token;
}

type JoseKey = Exclude<Awaited<ReturnType<typeof importPKCS8>>, Uint8Array> | Uint8Array;

const JWT_SECRET = config.JWT_SECRET;
const JWT_ALGORITHM = config.JWT_ALGORITHM;

let devKeyPair: { privateKey: JoseKey; publicKey: JoseKey } | null = null;

async function generateDevKeyPair(): Promise<{ privateKey: JoseKey; publicKey: JoseKey }> {
  if (devKeyPair) return devKeyPair;
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  devKeyPair = { privateKey, publicKey };
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
  if (config.JWT_PRIVATE_KEY_FILE) return importPKCS8(readPemFile(config.JWT_PRIVATE_KEY_FILE), 'RS256');
  if (config.NODE_ENV !== 'production') return (await generateDevKeyPair()).privateKey;
  throw new Error('RS256 模式下必须配置 JWT_PRIVATE_KEY 或 JWT_PRIVATE_KEY_FILE');
}

async function getPublicKey(): Promise<JoseKey> {
  if (config.JWT_PUBLIC_KEY) return importSPKI(config.JWT_PUBLIC_KEY, 'RS256');
  if (config.JWT_PUBLIC_KEY_FILE) return importSPKI(readPemFile(config.JWT_PUBLIC_KEY_FILE), 'RS256');
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
  role: 'admin' | 'analyst' | 'readonly',
  tenant?: TenantContext,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = { sub: userId, role, iat: now, exp: now + getRoleBasedAccessTtl(role) };
  if (tenant?.tenantId) payload.tenant_id = tenant.tenantId;
  if (tenant?.orgRole) payload.org_role = tenant.orgRole;
  if (tenant?.platformAdmin) payload.platform_admin = true;
  return signConfiguredJwt(payload);
}

const tracer = trace.getTracer('backtest-platform', '1.0.0');
const VALID_JWT_ROLES = new Set<JwtPayload['role']>(['admin', 'analyst', 'readonly']);

function hasRequiredClaims(payload: JwtPayload): boolean {
  return (
    typeof payload.sub === 'string' && payload.sub.length > 0 &&
    VALID_JWT_ROLES.has(payload.role) &&
    typeof payload.exp === 'number' && Number.isFinite(payload.exp)
  );
}

async function validateJwtPayload(payload: unknown, algorithm: string, span: Span): Promise<JwtPayload | null> {
  const jwtPayload = payload as JwtPayload;
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

async function verifyJwt(token: string): Promise<JwtPayload | null> {
  return tracer.startActiveSpan('jwt.verifyJwt', async (span) => {
    try {
      try {
        const { payload } = await jwtVerify(token, await getOrCachePublicKey(), { algorithms: ['RS256'] });
        return validateJwtPayload(payload, 'RS256', span);
      } catch {
        // RS256 验证失败，按策略决定是否回退 HS256
      }
      if (JWT_ALGORITHM !== 'HS256') {
        span.setAttribute('verify.result', 'failed');
        return null;
      }
      try {
        const { payload } = await jwtVerify(token, await getOrCacheHS256Key(), { algorithms: ['HS256'] });
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

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  return verifyJwt(token);
}

const USER_FAMILIES_PREFIX = 'user_families:';
const USER_REVOKED_PREFIX = 'user_revoked:';

async function setFamilyRevoked(familyId: string, lastToken: string, revoked = true): Promise<void> {
  await appRedis.set(
    `${TOKEN_FAMILY_PREFIX}${familyId}`,
    JSON.stringify({ lastToken, revoked } satisfies TokenFamilyEntry),
    'EX',
    REFRESH_TOKEN_EXPIRES_IN_SEC,
  );
}

async function revokeFamilyRedis(familyId: string): Promise<void> {
  const familyKey = `${TOKEN_FAMILY_PREFIX}${familyId}`;
  const familyRaw = await appRedis.get(familyKey);
  if (familyRaw) {
    const family = JSON.parse(familyRaw) as TokenFamilyEntry;
    if (family.lastToken) await appRedis.del(`${REFRESH_TOKEN_PREFIX}${family.lastToken}`);
  }
  await setFamilyRevoked(familyId, '', true);
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await requireRedis(`revoke:${refreshToken}`, () => revokeRefreshTokenRedis(refreshToken));
}

async function revokeRefreshTokenRedis(refreshToken: string): Promise<void> {
  const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
  const raw = await appRedis.get(tokenKey);
  if (raw) {
    const entry: RefreshTokenEntry = JSON.parse(raw);
    await revokeFamilyRedis(entry.familyId);
    await appRedis.del(tokenKey);
    logger.info({ familyId: entry.familyId }, '[jwtAuth] Redis: Refresh Token 及其 Family 已撤销');
  }
  const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
  const usedRaw = await appRedis.get(usedKey);
  if (usedRaw) {
    const { familyId } = JSON.parse(usedRaw) as { familyId: string };
    await revokeFamilyRedis(familyId);
    await appRedis.del(usedKey);
  }
}
export async function isAccessTokenRevokedForUser(userId: string, tokenIat: number): Promise<boolean> {
  return requireRedis(`${USER_REVOKED_PREFIX}${userId}`, async () => {
    const raw = await appRedis.get(`${USER_REVOKED_PREFIX}${userId}`);
    if (!raw) return false;
    const revokedAt = Number.parseInt(raw, 10);
    return Number.isFinite(revokedAt) && tokenIat <= revokedAt;
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  const revokedAt = Math.floor(Date.now() / 1000);
  await requireRedis(`revoke-all:${userId}`, async () => {
    const familiesKey = `${USER_FAMILIES_PREFIX}${userId}`;
    const familyIds = await appRedis.smembers(familiesKey);
    for (const familyId of familyIds) await revokeFamilyRedis(familyId);
    if (familyIds.length > 0) await appRedis.del(familiesKey);
    await appRedis.set(`${USER_REVOKED_PREFIX}${userId}`, String(revokedAt), 'EX', REFRESH_TOKEN_EXPIRES_IN_SEC);
    logger.info({ userId, familyCount: familyIds.length }, '[jwtAuth] Redis: 用户全部会话已撤销');
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  return requireRedis(`refresh:${refreshToken}`, () => refreshAccessTokenRedis(refreshToken));
}

async function issueRotatedTokens(entry: RefreshTokenEntry): Promise<{ accessToken: string; refreshToken: string }> {
  const tenant = tenantFromEntry(entry);
  const accessToken = await generateToken(entry.userId, entry.role, tenant);
  const newRefreshToken = await generateRefreshToken(entry.userId, entry.role, entry.familyId, tenant);
  return { accessToken, refreshToken: newRefreshToken };
}

async function refreshAccessTokenRedis(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const tokenKey = `${REFRESH_TOKEN_PREFIX}${refreshToken}`;
  const raw = await appRedis.get(tokenKey);
  if (!raw) return checkReuseAndRevoke(refreshToken);
  const entry: RefreshTokenEntry = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  if (entry.expiresAt < now) {
    await appRedis.del(tokenKey);
    return null;
  }
  if (!(await isUserSessionValid(entry.userId))) {
    await appRedis.del(tokenKey);
    logger.warn({ userId: hashUserId(entry.userId) }, '[jwtAuth] 用户已停用，拒绝 refresh');
    return null;
  }
  const familyRaw = await appRedis.get(`${TOKEN_FAMILY_PREFIX}${entry.familyId}`);
  if (familyRaw) {
    const family: TokenFamilyEntry = JSON.parse(familyRaw);
    if (family.revoked) {
      logger.warn({ familyId: entry.familyId }, '[jwtAuth] Token family 已被撤销（复用检测触发），拒绝刷新');
      await appRedis.del(tokenKey);
      return null;
    }
  }
  const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
  await appRedis.set(usedKey, JSON.stringify({ familyId: entry.familyId }), 'EX', REFRESH_TOKEN_EXPIRES_IN_SEC);
  await appRedis.del(tokenKey);
  return issueRotatedTokens(entry);
}

async function checkReuseAndRevoke(refreshToken: string): Promise<null> {
  const usedKey = `${REFRESH_TOKEN_PREFIX}used:${refreshToken}`;
  const usedRaw = await appRedis.get(usedKey);
  if (!usedRaw) return null;
  const { familyId } = JSON.parse(usedRaw) as { familyId: string };
  logger.warn({ familyId }, '[jwtAuth] 检测到 Refresh Token 复用！撤销整个 Token Family');
  await setFamilyRevoked(familyId, '', true);
  const familyRaw = await appRedis.get(`${TOKEN_FAMILY_PREFIX}${familyId}`);
  if (familyRaw) {
    const family: TokenFamilyEntry = JSON.parse(familyRaw);
    if (family.lastToken) await appRedis.del(`${REFRESH_TOKEN_PREFIX}${family.lastToken}`);
  }
  return null;
}

async function resolveApiKeyUser(apiKey: string): Promise<JwtPayload | null> {
  if (typeof apiKey !== 'string' || apiKey.length === 0 || apiKey.length > 128) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const verified = await verifyApiKey(apiKey);
  if (!verified) return null;
  const common = { iat: nowSec, exp: nowSec + ACCESS_TOKEN_EXPIRES_IN_SEC, api_key_id: verified.keyId };
  if (verified.isPlatformAdmin) {
    return { sub: 'platform:break-glass', role: 'admin', platform_admin: true, ...common };
  }
  return { sub: `apikey:${verified.keyId}`, role: 'analyst', tenant_id: verified.orgId ?? undefined, org_role: 'analyst', ...common };
}

function logApiKeyAuth(req: AuthenticatedRequest, middleware: string): void {
  logger.info(
    {
      middleware, path: req.path, userId: hashUserId(req.user?.sub), role: req.user?.role,
      tenantId: req.user?.tenant_id, platformAdmin: req.user?.platform_admin === true, requestId: req.id,
    },
    '[jwtAuth] API Key 认证通过',
  );
}
export async function handleApiKeyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) return;
  try {
    const user = await resolveApiKeyUser(apiKey);
    if (user) {
      req.user = user;
      attachAuthLogContext(req);
      logApiKeyAuth(req, 'jwtAuth');
      next();
      return;
    }
    logger.warn({ middleware: 'jwtAuth', path: req.path, error: 'API Key 无效', requestId: req.id }, '[jwtAuth] JWT 认证失败');
    sendProblem(res, 401, 'INVALID_API_KEY');
  } catch (err) {
    logger.error({ middleware: 'jwtAuth', path: req.path, requestId: req.id, err }, '[jwtAuth] API Key 验证基础设施错误，fail-closed 503');
    sendProblem(res, 503, 'AUTH_SERVICE_UNAVAILABLE', 'Authentication Service Unavailable', { detail: 'API key validation service is temporarily unavailable' });
  }
}

const API_KEY_RESOLUTION_TIMEOUT_MS = 5000;

export async function handleOptionalApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    req.user = null;
    logger.info({ middleware: 'optionalJwtAuth', path: req.path, requestId: req.id }, '[jwtAuth] 无有效 Bearer Token/API Key，匿名放行');
    next();
    return;
  }
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('API_KEY_RESOLUTION_TIMEOUT')), API_KEY_RESOLUTION_TIMEOUT_MS);
    });
    const user = await Promise.race([resolveApiKeyUser(apiKey), timeoutPromise]);
    if (user) {
      req.user = user;
      attachAuthLogContext(req);
      logApiKeyAuth(req, 'optionalJwtAuth');
    } else {
      req.user = null;
      logger.info({ middleware: 'optionalJwtAuth', path: req.path, requestId: req.id }, '[jwtAuth] 无有效 Bearer Token/API Key，匿名放行');
    }
    next();
  } catch (err) {
    if (err instanceof Error && err.message === 'API_KEY_RESOLUTION_TIMEOUT') {
      logger.warn({ middleware: 'optionalJwtAuth', path: req.path, requestId: req.id }, '[jwtAuth] API Key 解析超时（5s），返回 504');
      sendProblem(res, 504, 'GATEWAY_TIMEOUT', 'API Key Resolution Timeout', { detail: 'The API key resolution service did not respond within 5 seconds' });
      return;
    }
    logger.error({ middleware: 'optionalJwtAuth', path: req.path, requestId: req.id, err }, '[jwtAuth] API Key 验证基础设施错误，fail-closed 503');
    sendProblem(res, 503, 'AUTH_SERVICE_UNAVAILABLE', 'Authentication Service Unavailable', { detail: 'API key validation service is temporarily unavailable' });
  }
}

function tryDevBypass(req: AuthenticatedRequest, next: NextFunction): boolean {
  if (!(config.NODE_ENV === 'development' && config.DEV_SKIP_AUTH && config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production')) {
    return false;
  }
  logger.info({ middleware: 'jwtAuth', path: req.path }, '[jwtAuth] 开发旁路认证（readonly）');
  const now = Math.floor(Date.now() / 1000);
  req.user = { sub: 'dev-user', role: 'readonly', iat: now, exp: now + ACCESS_TOKEN_EXPIRES_IN_SEC };
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
    logger.warn({ middleware, path: req.path, userId: hashUserId(payload.sub), requestId: req.id }, '[jwtAuth] 会话已全局撤销，拒绝访问');
    recordAuthFailure(getRoutePattern(req), 'session_revoked');
    sendProblem(res, 401, 'SESSION_REVOKED');
    return true;
  }
  if (!(await isUserSessionValid(payload.sub))) {
    logger.warn({ middleware, path: req.path, userId: hashUserId(payload.sub), requestId: req.id }, '[jwtAuth] 用户已停用，拒绝访问');
    recordAuthFailure(getRoutePattern(req), 'account_disabled');
    sendProblem(res, 401, 'ACCOUNT_DISABLED');
    return true;
  }
  return false;
}

async function handleBearerTokenAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const payload = token ? await verifyToken(token) : null;
  if (!payload) {
    logger.warn({ middleware: 'jwtAuth', path: req.path, error: 'JWT token 无效或已过期', requestId: req.id }, '[jwtAuth] JWT 认证失败');
    recordAuthFailure(getRoutePattern(req), 'invalid_token');
    sendProblem(res, 401, 'INVALID_TOKEN');
    return;
  }
  if (await denyIfRevokedOrDisabled(payload, req, res, 'jwtAuth')) return;
  req.user = payload;
  attachAuthLogContext(req);
  logger.info({ middleware: 'jwtAuth', path: req.path, userId: hashUserId(req.user?.sub), role: req.user?.role, requestId: req.id }, '[jwtAuth] JWT 认证通过');
  next();
}

export function jwtAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  logger.info({ middleware: 'jwtAuth', path: req.path, method: req.method, requestId: req.id }, '[jwtAuth] JWT 认证检查');
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
  logger.warn({ middleware: 'jwtAuth', path: req.path, error: '缺少认证凭证', requestId: req.id }, '[jwtAuth] JWT 认证失败');
  recordAuthFailure(getRoutePattern(req), 'missing_credentials');
  sendProblem(res, 401, 'MISSING_CREDENTIALS');
}
async function handleOptionalBearer(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const payload = token ? await verifyToken(token) : null;
  if (!payload) {
    req.user = null;
    logger.warn({ middleware: 'optionalJwtAuth', path: req.path, error: 'JWT token 无效或已过期', requestId: req.id }, '[jwtAuth] JWT 认证失败，可选认证放行');
    next();
    return;
  }
  try {
    if (await denyIfRevokedOrDisabled(payload, req, res, 'optionalJwtAuth')) return;
  } catch {
    logger.warn({ middleware: 'optionalJwtAuth', path: req.path, userId: hashUserId(payload.sub), requestId: req.id }, '[jwtAuth] 会话状态校验异常，fail-closed 拒绝（可选认证路径）');
    recordAuthFailure(getRoutePattern(req), 'session_check_error');
    sendProblem(res, 401, 'AUTH_CHECK_FAILED');
    return;
  }
  req.user = payload;
  attachAuthLogContext(req);
  logger.info({ middleware: 'optionalJwtAuth', path: req.path, userId: hashUserId(req.user?.sub), role: req.user?.role, requestId: req.id }, '[jwtAuth] JWT 认证通过');
  next();
}

export function optionalJwtAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  logger.info({ middleware: 'optionalJwtAuth', path: req.path, method: req.method, requestId: req.id }, '[jwtAuth] 可选 JWT 认证检查');
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    void handleOptionalBearer(req, res, next).catch((err) => {
      logger.error({ err, path: req.path, requestId: req.id }, '[jwtAuth] handleOptionalBearer unhandled rejection');
      next(err);
    });
  } else {
    void handleOptionalApiKey(req, res, next);
  }
}

export function assignGuestReadonly(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  if (!req.user) {
    const now = Math.floor(Date.now() / 1000);
    req.user = { sub: 'guest', role: 'readonly', iat: now, exp: now + ACCESS_TOKEN_EXPIRES_IN_SEC };
    attachAuthLogContext(req);
  }
  next();
}

interface CachedResult {
  statusCode: number;
  body: unknown;
  timestamp: number;
}

const KEY_TTL_SEC = 3600;
const IDEMPOTENCY_REDIS_KEY_PREFIX = 'idempotency:';

export function idempotencyKey(req: Request, res: Response, next: NextFunction): void {
  if (req.method.toUpperCase() !== 'POST') { next(); return; }
  const key = req.headers['idempotency-key'] as string | undefined;
  if (!key) { next(); return; }
  if (key.length > 128) { sendProblem(res, 400, 'INVALID_IDEMPOTENCY_KEY'); return; }
  void handleIdempotencyKey(key, req, res, next);
}

async function handleIdempotencyKey(key: string, req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!(await getRedisHealth())) {
    sendProblem(res, 503, 'REDIS_UNAVAILABLE', undefined, { detail: 'Idempotency key requires Redis; please retry', headers: { 'Retry-After': '30' } });
    return;
  }
  await handleWithRedis(key, req, res, next);
}

function interceptResponse(res: Response, storageKey: string, storeFn: (key: string, entry: CachedResult) => void): void {
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown): Response {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      storeFn(storageKey, { statusCode: res.statusCode, body, timestamp: Date.now() });
    }
    return originalJson(body);
  };
}

async function handleWithRedis(key: string, req: Request, res: Response, next: NextFunction): Promise<void> {
  const redisKey = `${IDEMPOTENCY_REDIS_KEY_PREFIX}${key}`;
  try {
    const cached = await appRedis.get(redisKey);
    if (cached) {
      const result: CachedResult = JSON.parse(cached);
      logger.info({ middleware: 'idempotency', key, path: req.path, requestId: req.id }, '[idempotency] Redis 幂等性 Key 命中缓存，返回缓存结果');
      res.status(result.statusCode).json(result.body);
      return;
    }
    interceptResponse(res, redisKey, (k, entry) => {
      appRedis
        .set(k, JSON.stringify(entry), 'EX', KEY_TTL_SEC, 'NX')
        .then(() => logger.info({ middleware: 'idempotency', key, path: req.path, requestId: req.id }, '[idempotency] Redis 幂等性 Key 缓存写入'))
        .catch((err: unknown) => logger.warn({ middleware: 'idempotency', key, err: String(err) }, '[idempotency] Redis 缓存写入失败'));
    });
    next();
  } catch (err) {
    logger.warn({ middleware: 'idempotency', key, err: String(err) }, '[idempotency] Redis 操作异常，返回 503');
    markRedisUnhealthy();
    sendProblem(res, 503, 'REDIS_UNAVAILABLE', undefined, { detail: 'Idempotency key requires Redis; please retry', headers: { 'Retry-After': '30' } });
  }
}

// ============ 审计日志中间件（合并自 middleware/auditLog.ts）============

const auditLogger = logger.child({ audit: true, module: 'audit' });
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hashApiKey(apiKey: string | undefined): string {
  if (!apiKey) return 'anonymous';
  return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

function signPayload(payload: string): string {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) {
    logger.warn('AUDIT_HMAC_KEY not set, audit log signing disabled');
    return '';
  }
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

export function verifyPayload(payload: string, signature: string): boolean {
  const key = config.AUDIT_HMAC_KEY;
  if (!key) {
    logger.warn('AUDIT_HMAC_KEY not set, audit payload verification fails closed (returns false)');
    return false;
  }
  const expected = crypto.createHmac('sha256', key).update(payload).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export async function writeOutboxEvent(
  auditEntry: Record<string, unknown>,
  client?: PoolClient,
): Promise<void> {
  const conn = client ?? getPool();
  const payload = JSON.stringify(auditEntry);
  const signature = signPayload(payload);
  try {
    await conn.query(
      `INSERT INTO outbox (aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      ['audit', String(auditEntry.userId || 'unknown'), 'AuditEvent', { ...auditEntry, signature }],
    );
    // 仅独立模式发送 NOTIFY；事务模式由调用方在 COMMIT 后发送，避免回滚产生无效通知
    if (!client) {
      await conn.query('NOTIFY outbox_channel');
    }
    logger.debug({ middleware: 'auditLog', transactional: !!client }, '[auditLog] outbox 事件写入成功');
  } catch (err) {
    if (client) {
      logger.error({ err, middleware: 'auditLog' }, '[auditLog] outbox 事务写入失败，将触发事务回滚');
      throw err;
    }
    logger.warn({ err, middleware: 'auditLog' }, '[auditLog] outbox 事件写入失败，审计日志仍已记录到 pino 日志流');
  }
}

export function auditLog(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }
  res.on('finish', () => {
    const jwtSub = (req as AuthenticatedRequest).user?.sub;
    const userId = jwtSub ?? hashApiKey(req.headers['x-api-key'] as string | undefined);
    const auditEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl || req.url,
      userId,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      statusCode: res.statusCode,
      result: res.statusCode < 400 ? 'success' : 'failure',
    };
    logger.info(
      { middleware: 'auditLog', method: req.method, path: req.path, userId, statusCode: res.statusCode, requestId: req.id, audit: true },
      '[auditLog] 审计记录写入',
    );
    auditLogger.info(auditEntry, `[audit] ${req.method} ${req.originalUrl || req.url} → ${res.statusCode}`);
    void writeOutboxEvent(auditEntry);
  });
  next();
}
