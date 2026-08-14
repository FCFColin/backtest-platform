import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import crypto from 'crypto';
import client from 'prom-client';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { config } from '../config/index.js';
import { appRedis, getRedisHealth } from '../infrastructure/redisClient.js';
import { logger } from '../utils/logger.js';
import { getPrometheusRegister } from './metrics.js';
import { RedisUnavailableError } from './errors.js';

const rateLimiterRedisUnavailableCounter = new client.Counter({
  name: 'rate_limiter_redis_unavailable_total',
  help: 'Total times rate limiter fell back to deny-all due to Redis unavailability',
  registers: [getPrometheusRegister()],
});

// 限流命令必须有界：ioredis 断线时命令进入离线队列，重连成功前不会 resolve，
// 无超时会让被限流端点（含登录等安全路径）在 Redis 故障时挂 0-30s 才报错。
// 超时后抛 RedisUnavailableError → translateToProblem 统一映射 503 REDIS_UNAVAILABLE（fail-closed）。
const RATE_LIMITER_REDIS_TIMEOUT_MS = 2_000;
function sendRedisCommand(...args: string[]): Promise<RedisReply> {
  const command = (appRedis.call as (...a: string[]) => Promise<unknown>)(
    ...args,
  ) as Promise<RedisReply>;
  return Promise.race([
    command,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new RedisUnavailableError(
              `rate limiter redis command exceeded ${RATE_LIMITER_REDIS_TIMEOUT_MS}ms`,
            ),
          ),
        RATE_LIMITER_REDIS_TIMEOUT_MS,
      );
      timer.unref();
    }),
  ]);
}

// Redis 故障期间 fail-closed 503，此后每 30s 复测，恢复即自动重建真实限流器（自愈）
const RATE_LIMITER_PROBE_INTERVAL_MS = 30_000;
let redisHealthy = (await getRedisHealth()) === true;
let lastProbeAt = Date.now();
async function isRedisHealthyNow(): Promise<boolean> {
  if (redisHealthy) return true;
  if (Date.now() - lastProbeAt < RATE_LIMITER_PROBE_INTERVAL_MS) return false;
  lastProbeAt = Date.now();
  redisHealthy = (await getRedisHealth()) === true;
  if (redisHealthy) logger.info('[rate-limit] Redis 恢复，限流器自动重建');
  return redisHealthy;
}

// RedisStore 构造不触网（sendCommand 惰性），连通性由 isRedisHealthyNow 快照决定
function createRateLimiterStore(prefix: string): RedisStore | undefined {
  if (!redisHealthy) return undefined;
  try {
    return new RedisStore({ sendCommand: sendRedisCommand, prefix });
  } catch {
    logger.warn(`[rate-limit] Redis Store 创建失败 (${prefix})，限流器 fail-closed`);
    rateLimiterRedisUnavailableCounter.inc();
    return undefined;
  }
}

function computeRateLimitKey(req: Request): string {
  // 限流先于认证执行，JWT payload 可被伪造，不得信任——按原始 token 哈希分桶，
  // 伪造 token 只会烧自己桶，无法污染目标用户配额
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return `token:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
  }
  const apiKey = req.headers['x-api-key'];
  if (typeof apiKey === 'string' && apiKey.length > 0)
    return `apikey:${crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16)}`;
  return req.ip ?? '';
}

function authRateLimitKey(req: Request): string {
  const body = req.body as
    { username?: string; apiKey?: string; refreshToken?: string } | undefined;
  // 与 loginLockout 归一化一致（trim+lowercase），否则大小写/空白变体可拆分同一账户的限流预算
  if (body?.username) return `user:${body.username.trim().toLowerCase()}`;
  if (body?.apiKey)
    return `apikey:${crypto.createHash('sha256').update(body.apiKey).digest('hex').slice(0, 16)}`;
  if (body?.refreshToken)
    return `refresh:${crypto.createHash('sha256').update(body.refreshToken).digest('hex').slice(0, 16)}`;
  return req.ip ?? '';
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

function buildRateLimit(opts: LimiterOptions, store: RedisStore | undefined): RequestHandler {
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

function createLimiter(opts: LimiterOptions): RequestHandler {
  if (config.NODE_ENV === 'development' && config.DISABLE_RATE_LIMIT) {
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }
  const store = createRateLimiterStore(opts.storePrefix);
  if (store || (opts.passOnStoreError ?? false)) return buildRateLimit(opts, store);
  logger.warn(`[rate-limit] Redis 不可用，${opts.storePrefix} 限流器 fail-closed (503)`);
  const deny = createDenyAllLimiter(opts.code, opts.detail ?? 'Rate limiter unavailable');
  // 先同步 fail-closed 拒绝（不阻塞请求），后台探测 Redis 恢复后重建真实限流器并接管
  let limiter: RequestHandler | undefined;
  return (req, res, next) => {
    if (limiter) return limiter(req, res, next);
    deny(req, res, next);
    void (async () => {
      if (!limiter && (await isRedisHealthyNow())) {
        const recoveredStore = createRateLimiterStore(opts.storePrefix);
        if (recoveredStore) limiter = buildRateLimit(opts, recoveredStore);
      }
    })();
  };
}

export const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  storePrefix: 'rl:api:',
  // 挂载于认证之前：按原始 token/API key 哈希分桶，伪造 token 只烧自己桶，多租户共享 NAT 不误伤
  keyGenerator: computeRateLimitKey,
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
  keyGenerator: computeRateLimitKey,
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
