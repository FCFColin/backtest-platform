/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { RedisStore, type RedisReply } from 'rate-limit-redis'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config/index.js'
import { appRedis } from './config/redis.js'
import { jwtAuth, optionalJwtAuth } from './middleware/jwtAuth.js'
import { requirePermission, Permission } from './middleware/rbac.js'
import { auditLog } from './middleware/auditLog.js'
import { idempotencyKey } from './middleware/idempotency.js'
import { logger, httpLogger } from './utils/logger.js'
import { requestContextStorage } from './utils/requestContext.js'
import { httpRequestDurationMicroseconds, httpRequestsTotal } from './utils/metrics.js'
import dataRoutes from './routes/dataRoutes.js'
import dataManageRoutes from './routes/dataManageRoutes.js'
import backtestRoutes from './routes/backtestRoutes.js'
import backtestOptimizerRoutes from './routes/backtestOptimizerRoutes.js'
import tacticalRoutes from './routes/tacticalRoutes.js'
import pcaRoutes from './routes/pcaRoutes.js'
import signalRoutes from './routes/signalRoutes.js'
import letfRoutes from './routes/letfRoutes.js'
import tacticalGridRoutes from './routes/tacticalGridRoutes.js'
import goalOptimizerRoutes from './routes/goalOptimizerRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import authRoutes from './routes/authRoutes.js'
import healthRoutes from './routes/healthRoutes.js'
import { jobRoutes } from './routes/jobRoutes.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app: express.Application = express()

// 结构化 HTTP 请求日志（在所有路由前挂载）
app.use(httpLogger)

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
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req as Request & { id?: string }).id
  if (requestId) {
    requestContextStorage.run({ requestId }, () => next())
  } else {
    next()
  }
})

/**
 * Prometheus 指标采集中间件
 *
 * 企业理由：HTTP 请求的延迟分位数（P50/P95/P99）和请求量（RPS）
 * 是 SRE 黄金信号的核心指标，必须在中间件层自动采集，
 * 而非依赖每个路由手动记录。
 * 权衡：每个请求额外一次 Histogram.observe() 调用，开销可忽略。
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000
    const route = req.route?.path || req.path || 'unknown'
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    }
    httpRequestDurationMicroseconds.observe(labels, duration)
    httpRequestsTotal.inc(labels)
  })
  next()
})

/**
 * 安全中间件
 *
 * - `helmet`：设置一系列 HTTP 安全响应头（CSP、X-Frame-Options 等）
 * - CORS：根据 `config.CORS_ORIGINS` 收紧来源
 *   - `true`（开发默认）：允许全部来源
 *   - `string[]`：仅允许白名单中的来源，并允许携带凭证
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Tailwind needs inline
      imgSrc: ["'self'", "data:"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}))
// Permissions-Policy: 禁用摄像头、麦克风、地理位置（helmet v8 无内置，手动设置）
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
})

const corsOptions =
  config.CORS_ORIGINS === true
    ? (() => {
        // ⚠️ 安全警告：CORS_ORIGINS=true 允许所有来源，生产环境应配置白名单
        if (config.NODE_ENV === 'production') {
          logger.warn('[CORS] 生产环境 CORS_ORIGINS=true，允许所有来源，存在安全风险，请配置 CORS_ORIGINS 白名单');
        }
        return cors();
      })()
    : cors({ origin: config.CORS_ORIGINS })
app.use(corsOptions)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

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

/**
 * 创建限流器 Redis 存储（含降级策略）
 *
 * 企业理由：RedisStore 构造是同步的，不验证连接。
 * 运行时 Redis 不可用时，express-rate-limit 的 passOnStoreError
 * 会放行请求（fail-open），确保服务可用。
 * 开发环境未启动 Redis 时，限流自动降级为无限制模式。
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
    })
  } catch {
    logger.warn(`[rate-limit] Redis Store 创建失败 (${prefix})，降级到内存存储`)
    return undefined
  }
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true, // Redis 不可用时放行请求，避免服务中断
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
})

const computeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true,
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
})

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
})

// 计算密集型路由先应用更严格的限制器
app.use('/api/backtest', computeLimiter)
app.use('/api/backtest-optimizer', computeLimiter)
// 管理接口独立限流器（30次/分钟）
app.use('/api/v1/admin', adminLimiter)
app.use('/api/v1/data/manage', adminLimiter)
// 全局 API 限制器覆盖所有 /api/* 路由
app.use('/api/', apiLimiter)

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

// Security: 计算端点使用 optionalJwtAuth（JWT 优先，匿名放行）
// 企业为何需要：计算端点消耗CPU/内存资源，需识别用户身份用于配额与审计
// 权衡：可选认证渐进式引入，未认证用户以匿名身份访问，后续可收紧为强制认证
const computeAuth = optionalJwtAuth;

app.use('/api/v1/data', dataRoutes)
app.use('/api/v1/data/manage', jwtAuth, requirePermission(Permission.DATA_MANAGE), auditLog, idempotencyKey, dataManageRoutes)
app.use('/api/v1/backtest', computeAuth, backtestRoutes)
app.use('/api/v1/backtest-optimizer', computeAuth, backtestOptimizerRoutes)
app.use('/api/v1/tactical', computeAuth, tacticalRoutes)
app.use('/api/v1/pca', computeAuth, pcaRoutes)
app.use('/api/v1/signal', computeAuth, signalRoutes)
app.use('/api/v1/letf', computeAuth, letfRoutes)
app.use('/api/v1/tactical-grid', computeAuth, tacticalGridRoutes)
app.use('/api/v1/goal-optimizer', computeAuth, goalOptimizerRoutes)
app.use('/api/v1/admin', jwtAuth, requirePermission(Permission.ADMIN_ACCESS), auditLog, idempotencyKey, adminRoutes)
app.use('/api/v1/auth', authRoutes)
app.use('/api/v1', optionalJwtAuth, jobRoutes)

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
app.use('/api/data', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/data/>; rel="successor-version"');
  next();
}, dataRoutes)
app.use('/api/data/manage', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/data/manage/>; rel="successor-version"');
  next();
}, jwtAuth, requirePermission(Permission.DATA_MANAGE), auditLog, idempotencyKey, dataManageRoutes)
app.use('/api/backtest', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/backtest/>; rel="successor-version"');
  next();
}, computeAuth, backtestRoutes)
app.use('/api/backtest-optimizer', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/backtest-optimizer/>; rel="successor-version"');
  next();
}, computeAuth, backtestOptimizerRoutes)
app.use('/api/tactical', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/tactical/>; rel="successor-version"');
  next();
}, computeAuth, tacticalRoutes)
app.use('/api/pca', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/pca/>; rel="successor-version"');
  next();
}, computeAuth, pcaRoutes)
app.use('/api/signal', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/signal/>; rel="successor-version"');
  next();
}, computeAuth, signalRoutes)
app.use('/api/letf', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/letf/>; rel="successor-version"');
  next();
}, computeAuth, letfRoutes)
app.use('/api/tactical-grid', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/tactical-grid/>; rel="successor-version"');
  next();
}, computeAuth, tacticalGridRoutes)
app.use('/api/goal-optimizer', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/goal-optimizer/>; rel="successor-version"');
  next();
}, computeAuth, goalOptimizerRoutes)
app.use('/api/admin', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/admin/>; rel="successor-version"');
  next();
}, jwtAuth, requirePermission(Permission.ADMIN_ACCESS), auditLog, idempotencyKey, adminRoutes)
app.use('/api/auth', (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', '<https://backtest.platform/api/v1/auth/>; rel="successor-version"');
  next();
}, authRoutes)

/**
 * health
 *
 * 健康检查路由，不需要鉴权（不挂载 requireApiKey）。
 * 检测 Rust 引擎、Node.js 引擎、Go 数据服务的连通性与状态。
 */
app.use('/api', healthRoutes)

/**
 * 静态文件服务（生产环境 / Docker 部署）
 *
 * 在生产环境中托管前端构建产物（dist/）。
 * API 路由（/api/*）已在前文注册，优先匹配；
 * 未匹配的 GET 请求回退到前端 SPA，由 react-router 接管路由。
 */
if (config.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '../dist')
  app.use(express.static(distPath))
  // SPA 回退：非 /api/* 的 GET 请求返回 index.html
  app.get(/^\/(?!api\/).*/, (req: Request, res: Response) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
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
  logger.error({ err: error, requestId: (req as Request & { id?: string }).id }, '[Server Error]')
  res.status(500).json({
    success: false,
    error: {
      type: 'https://backtest.platform/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      code: 'INTERNAL_ERROR',
      detail: config.NODE_ENV === 'development'
        ? String(error.message).substring(0, 200)
        : 'An internal server error occurred',
    },
  })
})

/**
 * 404 handler — RFC 7807 格式
 *
 * 企业理由：404 也应使用统一的 Problem Details 格式，
 * 前端无需为不同 HTTP 状态码编写不同的错误解析逻辑。
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      type: 'https://backtest.platform/errors/not-found',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
      detail: `The requested resource ${req.method} ${req.path} was not found`,
    },
  })
})

export default app
