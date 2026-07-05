/**
 * This is a API server
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { config } from '../config/index.js';
import { appRedis } from '../config/redis.js';
import { logger, httpLogger } from '../utils/logger.js';
import { requestContextStorage } from '../utils/requestContext.js';
import { httpRequestDurationMicroseconds, httpRequestsTotal } from '../utils/metrics.js';
import healthRoutes from '../routes/healthRoutes.js';
import { billingWebhookHandler } from '../routes/billingRoutes.js';

export function setupMiddleware(app: express.Application): void {
  // Security (T-15): 信任反向代理的 X-Forwarded-For 头。
  // 企业为何需要：部署在 LB/Ingress 之后时，req.ip 默认是代理 IP，导致所有客户端共享同一
  // 限流计数（全局误伤）或限流可被伪造绕过。trust proxy 使 express-rate-limit 取到真实客户端 IP。
  // 取值：默认信任 1 跳（最近一个代理）；多层代理可经 TRUST_PROXY_HOPS 配置。
  // 权衡：信任跳数必须与实际拓扑一致，过度信任会让攻击者通过伪造 XFF 绕过限流。
  app.set('trust proxy', config.TRUST_PROXY_HOPS);

  // 结构化 HTTP 请求日志（在所有路由前挂载）
  app.use(httpLogger);

  /**
   * 请求上下文传播中间件
   *
   * 企业理由：pino-http 在 genReqId 中生成 request_id 并挂载到 req.id，
   * 但 req 对象无法穿透到非中间件代码（如 callService 等工具函数）。
   * 此处将 request_id 放入 AsyncLocalStorage，使下游服务调用（callService）
   * 能读取并注入 x-request-id 请求头，实现跨服务日志关联。
   * 必须在 httpLogger 之后挂载（依赖 req.id）。
   * 权衡：ALS 有纳秒级开销，但避免了函数签名污染。
   */
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    const requestId = _req.id !== undefined ? String(_req.id) : undefined;
    if (requestId) {
      requestContextStorage.run({ requestId }, () => next());
    } else {
      next();
    }
  });

  /**
   * Prometheus 指标采集中间件
   *
   * 企业理由：HTTP 请求的延迟分位数（P50/P95/P99）和请求量（RPS）
   * 是 SRE 黄金信号的核心指标，必须在中间件层自动采集，
   * 而非依赖每个路由手动记录。
   * 权衡：每个请求额外一次 Histogram.observe() 调用，开销可忽略。
   */
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const route = req.route?.path || req.path || 'unknown';
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };
      httpRequestDurationMicroseconds.observe(labels, duration);
      httpRequestsTotal.inc(labels);
    });
    next();
  });

  /**
   * 安全中间件
   *
   * - `helmet`：设置一系列 HTTP 安全响应头（CSP、X-Frame-Options 等）
   * - CORS：根据 `config.CORS_ORIGINS` 收紧来源
   *   - `true`（开发默认）：允许全部来源
   *   - `string[]`：仅允许白名单中的来源，并允许携带凭证
   */
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind needs inline
          imgSrc: ["'self'", 'data:'],
        },
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  // Permissions-Policy: 禁用摄像头、麦克风、地理位置（helmet v8 无内置，手动设置）
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  const corsOptions =
    config.CORS_ORIGINS === true
      ? (() => {
          // Security (T-03): 生产环境 CORS 通配已在 validateConfig() 中 hard-fail，
          // 此分支正常情况下仅在开发环境到达。保留运行时断言作为纵深防御（防止未来误改启动顺序）。
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

  // Stripe webhook 必须在全局 json 解析之前注册，以原始请求体做签名校验（ADR-036）。
  app.post('/api/v1/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    void billingWebhookHandler(req, res);
  });

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  /**
   * 速率限制
   *
   * - `apiLimiter`：普通 API 端点，100 次/15 分钟/IP
   * - `computeLimiter`：计算密集型端点（`/api/backtest/*`），10 次/分钟/IP
   *
   * 计算密集型路由需在 `apiLimiter` 之前挂载 `computeLimiter`，
   * 以便先于全局限制触发更严格的配额。
   *
   * 企业理由（Redis 分布式限流）：
   * K8s 多实例部署时，内存限流计数器每实例独立，
   * 攻击者可通过负载均衡绕过限流（N实例 × 限制 = 实际限制放大N倍）。
   * Redis 集中式计数确保所有实例共享同一限流状态。
   * 降级策略：Redis 不可用时 passOnStoreError 放行请求，
   * 避免因基础设施故障导致服务完全不可用。
   * 权衡：降级期间限流失效，但可用性优先于限流保护。
   */

  function createRateLimiterStore(prefix: string): RedisStore | undefined {
    try {
      return new RedisStore({
        // ioredis call 签名为 (command, ...args: (string|number|Buffer)[])，
        // rate-limit-redis sendCommand 签名为 (...args: string[])，
        // 类型不完全匹配，需断言。运行时 string[] 可安全传入 call。
        sendCommand: (...args: string[]) =>
          (appRedis.call as (...a: string[]) => Promise<unknown>)(...args) as Promise<RedisReply>,
        prefix,
      });
    } catch {
      logger.warn(`[rate-limit] Redis Store 创建失败 (${prefix})，降级到内存存储`);
      return undefined;
    }
  }

  /**
   * 计算端点限流键：优先 JWT sub，其次 x-api-key 哈希，最后 IP（T-G1）。
   *
   * 企业理由：纯 IP 限流在 NAT/企业网关后多用户共享 IP，误伤合法用户；
   * 攻击者可用多 IP 绕过。认证用户按 sub 限流更公平且难绕过。
   * 权衡：未验证 JWT payload 仅用于分桶（非授权），解析失败回退 IP。
   */
  /** 从 Bearer JWT 中提取限流标识（tenant_id 或 sub） */
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
    // 优先以租户为限流单位（ADR-037）：同组织成员共享配额，避免单租户多用户绕过计划上限。
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
    return ipKeyGenerator(req.ip ?? '', 56);
  }

  /**
   * 认证端点限流键：优先用户名/apiKey 哈希，降低 NAT 误伤与 XFF 绕过风险。
   */
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
    return ipKeyGenerator(req.ip ?? '', 56);
  }

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    // Security (ADR-025 / T-31): 全局 API 限流 fail-closed。此前 fail-open 允许 Redis 抖动时
    // 绕过 100/15min 配额，放大对 /data 等端点的滥用与侦察。与 auth/compute 一致，安全优先。
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
    // Security (ADR-020): 计算端点 fail-closed。Redis 不可用时拒绝请求而非放行。
    // 企业为何需要：compute 端点消耗大量 CPU/内存，限流失效（fail-open）会让攻击者
    // 仅靠制造 Redis 抖动即可绕过配额发起资源耗尽型 DoS。资源保护优先于可用性。
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

  // 计算密集型路由先应用更严格的限制器（legacy + v1）
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
  // 管理接口独立限流器（30次/分钟）
  app.use('/api/v1/admin', adminLimiter);
  app.use('/api/v1/data/manage', adminLimiter);
  // 认证端点独立限流器（10次/15分钟，防暴力破解）
  app.use(
    '/api/v1/auth/login',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: authRateLimitKey,
      // Security (ADR-020): 登录端点 fail-closed，防止 Redis 抖动时绕过限流进行暴力破解。
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
      // Security (ADR-020): refresh 端点 fail-closed，防止 token 暴力/重放绕过限流。
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
  // 健康检查与 Prometheus 指标必须在全局限流器之前挂载。
  // 否则 Redis 限流存储异常时 passOnStoreError:false 会在探活处理器之前返回 429，
  // 导致 K8s/负载均衡误判实例不可用。
  app.use('/api', healthRoutes);
  // 全局 API 限制器覆盖所有 /api/* 路由（/health、/metrics 已在上方注册，不再经过此限流器）
  app.use('/api/', apiLimiter);
}
