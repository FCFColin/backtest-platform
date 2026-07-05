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
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { appRedis } from './config/redis.js';
import { jwtAuth, optionalJwtAuth, assignGuestReadonly } from './middleware/jwtAuth.js';
import { resolveTenant, requireTenant } from './middleware/tenantContext.js';
import { requirePermission, Permission } from './middleware/rbac.js';
import { enforceQuota } from './middleware/quota.js';
import { USAGE_METRIC } from './config/planLimits.js';
import { auditLog } from './middleware/auditLog.js';
import { idempotencyKey } from './middleware/idempotency.js';
import { logger, httpLogger } from './utils/logger.js';
import { requestContextStorage } from './utils/requestContext.js';
import { httpRequestDurationMicroseconds, httpRequestsTotal } from './utils/metrics.js';
import dataRoutes from './routes/dataRoutes.js';
import dataManageRoutes from './routes/dataManageRoutes.js';
import backtestRoutes from './routes/backtestRoutes.js';
import backtestOptimizerRoutes from './routes/backtestOptimizerRoutes.js';
import tacticalRoutes from './routes/tacticalRoutes.js';
import pcaRoutes from './routes/pcaRoutes.js';
import signalRoutes from './routes/signalRoutes.js';
import letfRoutes from './routes/letfRoutes.js';
import tacticalGridRoutes from './routes/tacticalGridRoutes.js';
import goalOptimizerRoutes from './routes/goalOptimizerRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import apiKeyRoutes from './routes/apiKeyRoutes.js';
import portfolioRoutes from './routes/portfolioRoutes.js';
import configRoutes from './routes/configRoutes.js';
import runRoutes from './routes/runRoutes.js';
import orgRoutes from './routes/orgRoutes.js';
import billingRoutes, { billingWebhookHandler } from './routes/billingRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import debugRoutes from './routes/debugRoutes.js';
import { jobRoutes } from './routes/jobRoutes.js';

// for esm mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: express.Application = express();

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
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = req.id !== undefined ? String(req.id) : undefined;
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
          throw new Error('[CORS] 生产环境禁止 CORS_ORIGINS 通配，请配置来源白名单');
        }
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

/**
 * API Routes
 *
 * 所有业务路由挂载在 `/api/v1/` 前缀下，实现 API 版本化。
 *
 * 企业理由：API 版本化是向后兼容的保障。无版本化时破坏性变更
 * 无法平滑迁移，所有客户端必须同时更新。URL 路径版本化最直观，
 * 便于网关路由和客户端理解。
 * 权衡：版本化增加了 URL 长度，但这是行业标准做法。
 * 旧路径 `/api/xxx` 通过重定向兼容过渡期。
 *
 * `/api/v1/admin/*` 与 `/api/v1/data/manage/*` 为管理类接口，
 * 挂载 requireApiKey 中间件进行 API Key 鉴权。
 * 开发环境且未配置 ADMIN_API_KEY 时中间件自动放行，方便本地开发。
 *
 * 企业理由：计算密集型端点（backtest/*）需要认证保护，
 * 防止未授权调用消耗计算资源。使用 optionalApiKey 中间件：
 * - 有 API Key 时验证身份并记录
 * - 无 API Key 时放行但记录匿名访问
 * 生产环境可通过配置强制要求认证。
 */

// Security (T-03): 计算端点认证策略随 REQUIRE_API_KEY 收紧。
// 企业为何需要：计算端点消耗 CPU/内存，匿名访问可被滥用做资源耗尽 DoS。
// - REQUIRE_API_KEY=true（生产强制，见 validateConfig）：使用 jwtAuth 强制认证（JWT 或 x-api-key）。
// - 否则（开发/过渡）：optionalJwtAuth 识别身份但匿名放行，便于本地联调。
// 权衡：渐进式引入认证，生产默认安全（secure by default），开发保持零摩擦。
const computeAuth = config.REQUIRE_API_KEY ? jwtAuth : optionalJwtAuth;

// 计算端点 RBAC 门（ADR-032）。
// 企业为何需要：计算端点应按"用户在当前租户内的角色"授权（如 readonly 不能跑回测）。
// 开发零摩擦取舍：未强制认证（REQUIRE_API_KEY=false）时为透传，避免本地匿名联调被 401/403 阻断；
// 生产（REQUIRE_API_KEY=true）下叠加 requirePermission，secure by default。
const computePermission = (permission: Permission): express.RequestHandler =>
  config.REQUIRE_API_KEY ? requirePermission(permission) : (_req, _res, next) => next();

// 计划配额（ADR-037）：计算端点入口校验月度用量/标的数并计量。无租户上下文时内部放行（本地零摩擦）。
const computeQuota: express.RequestHandler = (req, res, next) => {
  void enforceQuota(USAGE_METRIC.BACKTEST)(req, res, next);
};

/** 数据引擎：只读 GET 允许访客（readonly）；写操作在路由内额外要求 DATA_MANAGE */
const dataManageAuth: express.RequestHandler[] = [
  optionalJwtAuth,
  assignGuestReadonly,
  requirePermission(Permission.DATA_READ),
  auditLog,
  idempotencyKey,
  dataManageRoutes,
];

app.use('/api/v1/data', optionalJwtAuth, assignGuestReadonly, dataRoutes);
app.use('/api/v1/data/manage', ...dataManageAuth);
// resolveTenant（ADR-032）：在认证之后软解析 JWT 的 tenant_id 到 req.tenantId，
// 供路由内 withTenant 激活 RLS。无租户上下文时放行，强制要求租户的端点再叠加 requireTenant。
app.use(
  '/api/v1/backtest',
  computeAuth,
  resolveTenant,
  computePermission(Permission.BACKTEST_RUN),
  computeQuota,
  auditLog,
  backtestRoutes,
);
app.use(
  '/api/v1/backtest-optimizer',
  computeAuth,
  resolveTenant,
  computePermission(Permission.OPTIMIZER_RUN),
  computeQuota,
  auditLog,
  backtestOptimizerRoutes,
);
app.use(
  '/api/v1/tactical',
  computeAuth,
  resolveTenant,
  computePermission(Permission.STRATEGY_MANAGE),
  computeQuota,
  auditLog,
  tacticalRoutes,
);
app.use(
  '/api/v1/pca',
  computeAuth,
  resolveTenant,
  computePermission(Permission.BACKTEST_RUN),
  computeQuota,
  auditLog,
  pcaRoutes,
);
app.use(
  '/api/v1/signal',
  computeAuth,
  resolveTenant,
  computePermission(Permission.SIGNAL_READ),
  auditLog,
  signalRoutes,
);
app.use(
  '/api/v1/letf',
  computeAuth,
  resolveTenant,
  computePermission(Permission.BACKTEST_RUN),
  computeQuota,
  auditLog,
  letfRoutes,
);
app.use(
  '/api/v1/tactical-grid',
  computeAuth,
  resolveTenant,
  computePermission(Permission.STRATEGY_MANAGE),
  computeQuota,
  auditLog,
  tacticalGridRoutes,
);
app.use(
  '/api/v1/goal-optimizer',
  computeAuth,
  resolveTenant,
  computePermission(Permission.STRATEGY_MANAGE),
  computeQuota,
  auditLog,
  goalOptimizerRoutes,
);
app.use(
  '/api/v1/admin',
  jwtAuth,
  resolveTenant,
  requirePermission(Permission.ADMIN_ACCESS),
  auditLog,
  idempotencyKey,
  adminRoutes,
);
app.use('/api/v1/auth', authRoutes);
// 按组织 API Key 管理（ADR-033）：仅活跃组织管理员可创建/查看/吊销
app.use(
  '/api/v1/keys',
  jwtAuth,
  resolveTenant,
  requireTenant,
  requirePermission(Permission.ADMIN_ACCESS),
  apiKeyRoutes,
);
// 租户作用域持久化（ADR-034）：组合/命名配置/回测历史，经 withTenant RLS 隔离
app.use(
  '/api/v1/portfolios',
  jwtAuth,
  resolveTenant,
  requireTenant,
  requirePermission(Permission.BACKTEST_RUN),
  portfolioRoutes,
);
app.use(
  '/api/v1/configs',
  jwtAuth,
  resolveTenant,
  requireTenant,
  requirePermission(Permission.BACKTEST_RUN),
  configRoutes,
);
app.use(
  '/api/v1/runs',
  jwtAuth,
  resolveTenant,
  requireTenant,
  requirePermission(Permission.BACKTEST_RUN),
  runRoutes,
);
// 组织与成员管理 + 邀请（ADR-035）。jwtAuth+resolveTenant 前置，requireTenant 由路由内部按需追加（接受邀请仅需登录）。
app.use('/api/v1/orgs', jwtAuth, resolveTenant, orgRoutes);
// Stripe 计费（ADR-036）。webhook 已在 json 之前单独挂载；此处为需鉴权的 checkout/portal/subscription。
app.use('/api/v1/billing', jwtAuth, resolveTenant, billingRoutes);
// Security (ADR-019): 任务状态端点强制认证。异步任务结果归属提交者，
// 需 req.user 才能做所有权校验，故由 optionalJwtAuth 升级为 jwtAuth。
app.use('/api/v1', jwtAuth, resolveTenant, jobRoutes);

/**
 * 旧路径兼容重定向（过渡期）
 *
 * 企业理由：旧客户端可能仍使用 `/api/xxx` 路径，
 * 重定向确保向后兼容，避免破坏现有调用方。
 * 过渡期结束后可移除此重定向。
 *
 * RFC 8594 Deprecation + Sunset 头：
 * - Deprecation: true 表示该资源已弃用
 * - Sunset: 6 个月后的日期，表示该资源将被移除
 * - Link: 指向 successor-version，引导客户端迁移到 /api/v1/
 */
const SUNSET_DATE = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 6 个月后

function deprecateRoute(path: string, v1Path: string, ...handlers: express.RequestHandler[]) {
  app.use(
    path,
    (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', SUNSET_DATE);
      res.setHeader(
        'Link',
        `<https://backtest.platform/api/v1${v1Path}/>; rel="successor-version"`,
      );
      next();
    },
    ...handlers,
  );
}

const routes: Record<string, [string, ...express.RequestHandler[]]> = {
  '/api/data': ['/data', optionalJwtAuth, assignGuestReadonly, dataRoutes],
  '/api/data/manage': [
    '/data/manage',
    optionalJwtAuth,
    assignGuestReadonly,
    requirePermission(Permission.DATA_READ),
    auditLog,
    idempotencyKey,
    dataManageRoutes,
  ],
  '/api/backtest': [
    '/backtest',
    computeAuth,
    resolveTenant,
    computePermission(Permission.BACKTEST_RUN),
    computeQuota,
    auditLog,
    backtestRoutes,
  ],
  '/api/backtest-optimizer': [
    '/backtest-optimizer',
    computeAuth,
    resolveTenant,
    computePermission(Permission.OPTIMIZER_RUN),
    computeQuota,
    auditLog,
    backtestOptimizerRoutes,
  ],
  '/api/tactical': [
    '/tactical',
    computeAuth,
    resolveTenant,
    computePermission(Permission.STRATEGY_MANAGE),
    computeQuota,
    auditLog,
    tacticalRoutes,
  ],
  '/api/pca': [
    '/pca',
    computeAuth,
    resolveTenant,
    computePermission(Permission.BACKTEST_RUN),
    computeQuota,
    auditLog,
    pcaRoutes,
  ],
  '/api/signal': [
    '/signal',
    computeAuth,
    resolveTenant,
    computePermission(Permission.SIGNAL_READ),
    auditLog,
    signalRoutes,
  ],
  '/api/letf': [
    '/letf',
    computeAuth,
    resolveTenant,
    computePermission(Permission.BACKTEST_RUN),
    computeQuota,
    auditLog,
    letfRoutes,
  ],
  '/api/tactical-grid': [
    '/tactical-grid',
    computeAuth,
    resolveTenant,
    computePermission(Permission.STRATEGY_MANAGE),
    computeQuota,
    auditLog,
    tacticalGridRoutes,
  ],
  '/api/goal-optimizer': [
    '/goal-optimizer',
    computeAuth,
    resolveTenant,
    computePermission(Permission.STRATEGY_MANAGE),
    computeQuota,
    auditLog,
    goalOptimizerRoutes,
  ],
  '/api/admin': [
    '/admin',
    jwtAuth,
    requirePermission(Permission.ADMIN_ACCESS),
    auditLog,
    idempotencyKey,
    adminRoutes,
  ],
  '/api/auth': ['/auth', authRoutes],
};

for (const [legacyPath, [v1Suffix, ...handler]] of Object.entries(routes)) {
  deprecateRoute(legacyPath, v1Suffix, ...handler);
}

/**
 * health
 *
 * debug 路由挂载（health 已在全局限流器之前注册，见 apiLimiter 上方）。
 */
app.use('/api/v1', debugRoutes);

/**
 * 静态文件服务（生产环境 / SERVE_STATIC 开发模式 / Docker 部署）
 *
 * SaaS 前端应以预构建 dist/ 交付，而非 Vite dev 按需编译。
 * API 路由（/api/*）已在前文注册，优先匹配；
 * 未匹配的 GET 请求回退到前端 SPA，由 react-router 接管路由。
 */
if (config.NODE_ENV === 'production' || config.SERVE_STATIC) {
  const distPath = path.resolve(__dirname, '../dist');
  app.use(express.static(distPath, { maxAge: config.NODE_ENV === 'production' ? '1y' : 0 }));
  // SPA 回退：非 /api/* 的 GET 请求返回 index.html
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

/**
 * RFC 7807 Problem Details 统一错误响应格式
 *
 * 企业理由：RFC 7807 是 HTTP API 错误响应的行业标准，提供机器可读的
 * type URI 和人类可读的 title/detail，使前端和监控系统可按 type 分类
 * 处理错误，而非解析自由文本。统一的错误格式也便于 API 网关、
 * APM 系统自动聚合和分析错误趋势。
 *
 * 权衡：
 * - error 字段从 { code, message } 变更为 { type, title, status, code, detail }，
 *   是破坏性变更，需配合前端同步更新。
 * - 开发环境在 detail 中暴露错误详情便于调试，生产环境隐藏详情防止信息泄露。
 * - type URI 使用自托管域名（backtest.platform），生产环境应替换为真实域名
 *   并提供错误类型文档页面。
 */
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  const userId = (req as { user?: { sub?: string } }).user?.sub;
  logger.error(
    { err: error, requestId: req.id, method: req.method, path: req.path, ip: req.ip, userId },
    '[Server Error]',
  );
  res.status(500).json({
    success: false,
    error: {
      type: 'https://backtest.platform/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail:
        config.NODE_ENV === 'development'
          ? String(error.message).substring(0, 200)
          : 'An internal server error occurred',
    },
  });
});

/**
 * 404 handler — RFC 7807 格式
 *
 * 企业理由：404 也应使用统一的 Problem Details 格式，
 * 前端无需为不同 HTTP 状态码编写不同的错误解析逻辑。
 */
app.use((req: Request, res: Response) => {
  // Security (T-28 / 反射输出)：不把请求路径回显到响应体，避免反射型内容（XSS 探测面）
  // 与路径侦察便利。仅回显安全的请求方法，路径记入服务端日志供排障。
  logger.info({ method: req.method, path: req.path }, '[app] 404 未匹配路由');
  res.status(404).json({
    success: false,
    error: {
      type: 'https://backtest.platform/errors/not-found',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: `The requested ${req.method} resource was not found`,
    },
  });
});

export default app;
