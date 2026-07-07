/**
 * 速率限制配置
 *
 * 集中管理所有限流器定义与键生成函数，从 app.ts 拆分而来。
 */

import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import crypto from 'crypto';
import type { Request } from 'express';
import { config } from '../config/index.js';
import { appRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

function createRateLimiterStore(prefix: string): RedisStore | undefined {
  try {
    return new RedisStore({
      sendCommand: (...args: string[]) =>
        (appRedis.call as (...a: string[]) => Promise<unknown>)(...args) as Promise<RedisReply>,
      prefix,
    });
  } catch {
    logger.warn(`[rate-limit] Redis Store 创建失败 (${prefix})，降级到内存存储`);
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

const RATE_LIMIT_MESSAGE = {
  success: false,
  error: {
    type: 'https://backtest.platform/errors/rate-limited',
    title: 'Too Many Requests',
    status: 429,
    code: 'RATE_LIMITED',
    detail: '请求过于频繁，请稍后再试',
  },
};

const AUTH_RATE_LIMIT_MESSAGE = {
  success: false,
  error: {
    type: 'https://backtest.platform/errors/rate-limited',
    title: 'Too Many Requests',
    status: 429,
    code: 'AUTH_RATE_LIMITED',
    detail: '登录尝试过于频繁，请稍后再试',
  },
};

const AUTH_REFRESH_RATE_LIMIT_MESSAGE = {
  success: false,
  error: {
    type: 'https://backtest.platform/errors/rate-limited',
    title: 'Too Many Requests',
    status: 429,
    code: 'AUTH_RATE_LIMITED',
    detail: '刷新尝试过于频繁，请稍后再试',
  },
};

const ADMIN_RATE_LIMIT_MESSAGE = {
  success: false,
  error: {
    type: 'https://backtest.platform/errors/rate-limited',
    title: 'Too Many Requests',
    status: 429,
    code: 'RATE_LIMITED',
    detail: '管理接口请求过于频繁，请稍后再试',
  },
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: false,
  store: createRateLimiterStore('rl:api:'),
  message: RATE_LIMIT_MESSAGE,
});

export const computeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.COMPUTE_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: computeRateLimitKey,
  passOnStoreError: false,
  store: createRateLimiterStore('rl:compute:'),
  message: RATE_LIMIT_MESSAGE,
});

export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
  store: createRateLimiterStore('rl:admin:'),
  message: ADMIN_RATE_LIMIT_MESSAGE,
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authRateLimitKey,
  passOnStoreError: false,
  store: createRateLimiterStore('rl:auth:'),
  message: AUTH_RATE_LIMIT_MESSAGE,
});

export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authRateLimitKey,
  passOnStoreError: false,
  store: createRateLimiterStore('rl:auth-refresh:'),
  message: AUTH_REFRESH_RATE_LIMIT_MESSAGE,
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: authRateLimitKey,
  passOnStoreError: false,
  store: createRateLimiterStore('rl:register:'),
  message: {
    success: false,
    error: {
      type: 'https://backtest.platform/errors/rate-limited',
      title: 'Too Many Requests',
      status: 429,
      code: 'REGISTER_RATE_LIMITED',
      detail: '注册尝试过于频繁，请稍后再试',
    },
  },
});
