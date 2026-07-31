/**
 * 速率限制配置（集中管理所有限流器定义与键生成函数）。
 *
 * P0-05：Redis 不可用时限流 fail-closed——生产环境多实例部署时，内存存储
 * 会导致每实例独立计数，实际限流上限 = 配置值 × 实例数，等同无限流。
 * 改为 Redis 不可用时返回 503，拒绝所有请求直到 Redis 恢复。
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

export function updateRedisAvailability(available: boolean): void {
  if (available !== redisAvailable) {
    redisAvailable = available;
    if (available) {
      logger.info('[rate-limit] Redis 恢复可用，限流器恢复正常');
    } else {
      logger.warn('[rate-limit] Redis 不可用，限流器 fail-closed (503)');
      rateLimiterRedisUnavailableCounter.inc();
    }
  }
}

function createRateLimiterStore(prefix: string): RedisStore | undefined {
  if (!redisAvailable) {
    return undefined;
  }
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
  // 已认证请求（jwtAuth 中间件已注入 req.user）优先按 userId:ip 组合键限流，
  // 避免 NAT/企业代理后多用户共享同一 IP 限流桶。
  const user = (req as { user?: { sub?: string } }).user;
  if (user?.sub) {
    return `${user.sub}:${req.ip ?? ''}`;
  }
  const tenantId = (req as { tenantId?: string }).tenantId;
  if (typeof tenantId === 'string' && tenantId.length > 0) return `tenant:${tenantId}`;
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const jwtId = extractJwtIdentifier(authHeader);
    if (jwtId) return jwtId;
  }
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0) {
    return `apikey:${crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16)}`;
  }
  return req.ip ?? '';
}

function authRateLimitKey(req: Request): string {
  const body = req.body as
    { username?: string; apiKey?: string; refreshToken?: string } | undefined;
  if (body?.username) return `user:${body.username}`;
  if (body?.apiKey) {
    return `apikey:${crypto.createHash('sha256').update(body.apiKey).digest('hex').slice(0, 16)}`;
  }
  if (body?.refreshToken) {
    return `refresh:${crypto.createHash('sha256').update(body.refreshToken).digest('hex').slice(0, 16)}`;
  }
  return req.ip ?? '';
}

/**
 * JWT 感知的通用键生成器。
 *
 * 已认证请求（jwtAuth 中间件已注入 req.user）按 `userId:ip` 组合键限流——
 * 同一用户在不同 IP 仍受独立计数，且 NAT/企业代理后多用户不再共享同一 IP 限流桶。
 * 未认证请求回退到 `ip:` 前缀的 IP 键。
 *
 * 用于通用与管理限流器（apiLimiter / adminLimiter），这些路由在认证中间件之后执行，
 * 可安全依赖 req.user。认证类端点（login/register/refresh）在认证之前执行，
 * 不应使用此生成器——它们继续使用 authRateLimitKey 基于 body 标识限流。
 */
function jwtAwareKeyGenerator(req: Request): string {
  const user = (req as { user?: { sub?: string } }).user;
  if (user?.sub) {
    return `${user.sub}:${req.ip ?? ''}`;
  }
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

/**
 * 创建 deny-all 中间件：Redis 不可用时拒绝所有请求（P0-05 fail-closed）。
 * adminLimiter 例外（passOnStoreError=true）：管理接口仍允许通过，便于运维排查。
 */
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

/**
 * 创建限流器，统一 standardHeaders/legacyHeaders/store 公共字段。
 * P0-05：Redis 不可用时（store=undefined 且 passOnStoreError=false），
 * 返回 deny-all 中间件而非降级到内存存储。
 */
function createLimiter(opts: LimiterOptions): RequestHandler {
  const store = createRateLimiterStore(opts.storePrefix);

  // Redis 不可用且非 admin 路由 → fail-closed (503)
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