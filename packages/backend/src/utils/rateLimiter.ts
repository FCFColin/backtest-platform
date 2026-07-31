/**
 * 速率限制配置（集中管理限流器定义与键生成）。
 * P0-05：Redis 不可用时限流 fail-closed——多实例下内存存储会变成"配置值 × 实例数"，等同无限流，故返回 503 拒绝所有请求直到 Redis 恢复。
 */
import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import crypto from 'crypto';
import client from 'prom-client';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { config } from '../config/index.js';
import { appRedis } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { getPrometheusRegister } from './metrics.js';

const rateLimiterRedisUnavailableCounter = new client.Counter({
  name: 'rate_limiter_redis_unavailable_total',
  help: 'Total times rate limiter fell back to deny-all due to Redis unavailability',
  registers: [getPrometheusRegister()],
});

let redisAvailable = false;
try {
  new RedisStore({
    sendCommand: (...args: string[]) =>
      (appRedis.call as (...a: string[]) => Promise<unknown>)(...args) as Promise<RedisReply>,
    prefix: 'rl:health:',
  });
  redisAvailable = true;
} catch {
  logger.error('[rate-limit] Redis 不可用，所有限流器将 fail-closed (503)');
  rateLimiterRedisUnavailableCounter.inc();
}

function createRateLimiterStore(prefix: string): RedisStore | undefined {
  if (!redisAvailable) return undefined;
  try {
    return new RedisStore({
      sendCommand: (...args: string[]) =>
        (appRedis.call as (...a: string[]) => Promise<unknown>)(...args) as Promise<RedisReply>,
      prefix,
    });
  } catch {
    logger.warn(`[rate-limit] Redis Store 创建失败 (${prefix})，限流器 fail-closed`);
    rateLimiterRedisUnavailableCounter.inc();
    return undefined;
  }
}

function extractJwtIdentifier(authHeader: string): string | null {
  try {
    const segment = authHeader.slice(7).trim().split('.')[1];
    if (!segment) return null;
    const payload = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as {
      sub?: string;
      tenant_id?: string;
    };
    if (payload.tenant_id) return `tenant:${payload.tenant_id}`;
    if (payload.sub) return `user:${payload.sub}`;
    return null;
  } catch {
    return null;
  }
}

function computeRateLimitKey(req: Request): string {
  // 已认证（jwtAuth 已注入 req.user）优先按 userId:ip 组合键，避免 NAT/代理后多用户共享同一 IP 限流桶
  const user = (req as { user?: { sub?: string } }).user;
  if (user?.sub) return `${user.sub}:${req.ip ?? ''}`;
  const tenantId = (req as { tenantId?: string }).tenantId;
  if (typeof tenantId === 'string' && tenantId.length > 0) return `tenant:${tenantId}`;
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const jwtId = extractJwtIdentifier(authHeader);
    if (jwtId) return jwtId;
  }
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0)
    return `apikey:${crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16)}`;
  return req.ip ?? '';
}

function authRateLimitKey(req: Request): string {
  const body = req.body as
    { username?: string; apiKey?: string; refreshToken?: string } | undefined;
  if (body?.username) return `user:${body.username}`;
  if (body?.apiKey)
    return `apikey:${crypto.createHash('sha256').update(body.apiKey).digest('hex').slice(0, 16)}`;
  if (body?.refreshToken)
    return `refresh:${crypto.createHash('sha256').update(body.refreshToken).digest('hex').slice(0, 16)}`;
  return req.ip ?? '';
}

/**
 * JWT 感知键生成器（apiLimiter/adminLimiter 用，这些路由在认证中间件之后执行可依赖 req.user）。
 * 已认证按 `userId:ip` 组合键；未认证回退 `ip:` 前缀 IP 键。认证端点（认证前执行）不用此生成器，用 authRateLimitKey。
 */
function jwtAwareKeyGenerator(req: Request): string {
  const user = (req as { user?: { sub?: string } }).user;
  if (user?.sub) return `${user.sub}:${req.ip ?? ''}`;
  return `ip:${req.ip ?? ''}`;
}

function buildRateLimitMessage(code: string, detail?: string) {
  return {
    success: false,
    error: {
      type: 'https://backtest.platform/errors/rate-limited',
      title: code,
      status: 429,
      code,
      ...(detail ? { detail } : {}),
    },
  };
}

interface LimiterOptions {
  windowMs: number;
  max: number;
  storePrefix: string;
  code: string;
  detail?: string;
  keyGenerator?: (req: Request) => string;
  passOnStoreError?: boolean;
}

/** deny-all 中间件：Redis 不可用时拒绝所有请求（P0-05 fail-closed）。adminLimiter 例外（passOnStoreError=true）便于运维排查。 */
function createDenyAllLimiter(code: string, detail: string): RequestHandler {
  return (req: Request, res: Response, _next: NextFunction) => {
    res
      .status(503)
      .header('Content-Type', 'application/problem+json')
      .json({
        success: false,
        error: {
          type: 'https://backtest.platform/errors/service-unavailable',
          title: code,
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          detail: `Rate limiter unavailable: ${detail}. Redis is required for distributed rate limiting.`,
          instance: req.path,
        },
      });
  };
}

/** 创建限流器：统一 standardHeaders/legacyHeaders/store。Redis 不可用且非 admin 路由 → deny-all（P0-05，不降级内存存储）。 */
function createLimiter(opts: LimiterOptions): RequestHandler {
  const store = createRateLimiterStore(opts.storePrefix);
  if (!store && !(opts.passOnStoreError ?? false)) {
    logger.warn(`[rate-limit] Redis 不可用，${opts.storePrefix} 限流器 fail-closed (503)`);
    return createDenyAllLimiter(opts.code, opts.detail ?? 'Rate limiter unavailable');
  }
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: opts.passOnStoreError ?? false,
    keyGenerator: opts.keyGenerator,
    store,
    message: buildRateLimitMessage(opts.code, opts.detail),
  });
}

export const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  storePrefix: 'rl:api:',
  keyGenerator: jwtAwareKeyGenerator,
  code: 'RATE_LIMITED',
  detail: '请求过于频繁，请稍后再试',
});
export const computeLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: config.COMPUTE_RATE_LIMIT_MAX,
  storePrefix: 'rl:compute:',
  keyGenerator: computeRateLimitKey,
  code: 'RATE_LIMITED',
  detail: '请求过于频繁，请稍后再试',
});
export const adminLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  storePrefix: 'rl:admin:',
  passOnStoreError: true,
  keyGenerator: jwtAwareKeyGenerator,
  code: 'RATE_LIMITED',
  detail: '管理接口请求过于频繁，请稍后再试',
});
export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  storePrefix: 'rl:auth:',
  keyGenerator: authRateLimitKey,
  code: 'AUTH_RATE_LIMITED',
  detail: '登录尝试过于频繁，请稍后再试',
});
export const refreshLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  storePrefix: 'rl:auth-refresh:',
  keyGenerator: authRateLimitKey,
  code: 'AUTH_RATE_LIMITED',
  detail: '刷新尝试过于频繁，请稍后再试',
});
export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  storePrefix: 'rl:register:',
  keyGenerator: authRateLimitKey,
  code: 'REGISTER_RATE_LIMITED',
  detail: '注册尝试过于频繁，请稍后再试',
});
