/**
 * This is a API server
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { config } from '../config/index.js';
import { appRedis } from '../config/redis.js';
import { logger, httpLogger } from '../utils/logger.js';
import { requestContextStorage } from '../utils/requestContext.js';
import { httpRequestDurationMicroseconds, httpRequestsTotal } from '../utils/metrics.js';
import healthRoutes from '../routes/healthRoutes.js';
import { billingWebhookHandler } from '../routes/billingRoutes.js';

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

function setupRateLimiters(app: express.Application) {
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: false,
    store: createRateLimiterStore('rl:api:'),
    message: {
      success: false,
      error: {
        type: 'https://backtest.platform/errors/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        code: 'RATE_LIMITED',
        detail: '请求过于频繁，请稍后再试',
      },
    },
  });

  const computeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: config.COMPUTE_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: computeRateLimitKey,
    passOnStoreError: false,
    store: createRateLimiterStore('rl:compute:'),
    message: {
      success: false,
      error: {
        type: 'https://backtest.platform/errors/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        code: 'RATE_LIMITED',
        detail: '计算接口请求过于频繁，请稍后再试',
      },
    },
  });

  const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store: createRateLimiterStore('rl:admin:'),
    message: {
      success: false,
      error: {
        type: 'https://backtest.platform/errors/rate-limited',
        title: 'Too Many Requests',
        status: 429,
        code: 'RATE_LIMITED',
        detail: '管理接口请求过于频繁，请稍后再试',
      },
    },
  });

  app.use('/api/backtest', computeLimiter);
  app.use('/api/backtest-optimizer', computeLimiter);
  app.use('/api/v1/backtest', computeLimiter);
  app.use('/api/v1/backtest-optimizer', computeLimiter);
  app.use('/api/v1/tactical', computeLimiter);
  app.use('/api/v1/pca', computeLimiter);
  app.use('/api/v1/signal', computeLimiter);
  app.use('/api/v1/letf', computeLimiter);
  app.use('/api/v1/tactical-grid', computeLimiter);
  app.use('/api/v1/goal-optimizer', computeLimiter);
  app.use('/api/v1/admin', adminLimiter);
  app.use('/api/v1/data/manage', adminLimiter);
  app.use(
    '/api/v1/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: authRateLimitKey,
      passOnStoreError: false,
      store: createRateLimiterStore('rl:auth:'),
      message: {
        success: false,
        error: {
          type: 'https://backtest.platform/errors/rate-limited',
          title: 'Too Many Requests',
          status: 429,
          code: 'AUTH_RATE_LIMITED',
          detail: '登录尝试过于频繁，请稍后再试',
        },
      },
    }),
  );
  app.use(
    '/api/v1/auth/refresh',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: authRateLimitKey,
      passOnStoreError: false,
      store: createRateLimiterStore('rl:auth-refresh:'),
      message: {
        success: false,
        error: {
          type: 'https://backtest.platform/errors/rate-limited',
          title: 'Too Many Requests',
          status: 429,
          code: 'AUTH_RATE_LIMITED',
          detail: '刷新尝试过于频繁，请稍后再试',
        },
      },
    }),
  );
  app.use('/api', healthRoutes);
  app.use('/api/', apiLimiter);
}

function setupSecurityMiddleware(app: express.Application) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  const corsOptions =
    config.CORS_ORIGINS === true
      ? (() => {
          if (config.NODE_ENV === 'production') {
            logger.error(
              '[CORS] 生产环境启动：CORS_ORIGINS 为通配模式，安全风险严重，请立即配置来源白名单',
            );
            throw new Error('[CORS] 生产环境禁止 CORS_ORIGINS 通配，请配置来源白名单');
          }
          logger.warn('[CORS] 开发环境使用 CORS 通配模式，允许所有来源');
          return cors();
        })()
      : cors({ origin: config.CORS_ORIGINS });
  app.use(corsOptions);

  app.use(
    compression({
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
      },
    }),
  );
}

export function setupMiddleware(app: express.Application): void {
  app.set('trust proxy', config.TRUST_PROXY_HOPS);
  app.use(httpLogger);

  app.use((_req: Request, _res: Response, next: NextFunction) => {
    const requestId = _req.id !== undefined ? String(_req.id) : undefined;
    if (requestId) {
      requestContextStorage.run({ requestId }, () => next());
    } else {
      next();
    }
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path || 'unknown';
      httpRequestDurationMicroseconds.observe(
        { method: req.method, route, status_code: String(res.statusCode) },
        duration,
      );
      httpRequestsTotal.inc({ method: req.method, route, status_code: String(res.statusCode) });
    });
    next();
  });

  setupSecurityMiddleware(app);

  app.post('/api/v1/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    void billingWebhookHandler(req, res);
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  setupRateLimiters(app);
}
