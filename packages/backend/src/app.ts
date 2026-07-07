/**
 * This is a API server
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { config } from './config/index.js';
import { jwtAuth, optionalJwtAuth, assignGuestReadonly } from './middleware/jwtAuth.js';
import { resolveTenant, requireTenant } from './middleware/tenantContext.js';
import { requirePermission, Permission } from './middleware/rbac.js';
import { enforceQuota } from './middleware/quota.js';
import { USAGE_METRIC } from './config/planLimits.js';
import { auditLog } from './middleware/auditLog.js';
import { idempotencyKey } from './middleware/idempotency.js';
import { httpLogger } from './utils/logger.js';
import { requestContextStorage } from './utils/requestContext.js';
import { httpRequestDurationMicroseconds, httpRequestsTotal } from './utils/metrics.js';
import {
  apiLimiter,
  computeLimiter,
  adminLimiter,
  loginLimiter,
  refreshLimiter,
  registerLimiter,
} from './utils/rateLimiter.js';
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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

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
 *
 * 限流器配置定义已移至 utils/rateLimiter.ts。
 */

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
app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth/register', registerLimiter);
app.use('/api/v1/auth/refresh', refreshLimiter);
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
  app.use(
    express.static(config.FRONTEND_DIST_DIR, {
      maxAge: config.NODE_ENV === 'production' ? '1y' : 0,
    }),
  );
  // SPA 回退：非 /api/* 的 GET 请求返回 index.html
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(config.FRONTEND_DIST_DIR + '/index.html');
  });
}

app.use(errorHandler);

app.use(notFoundHandler);

export default app;
