import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { config } from './config/index.js';
import { jwtAuth } from './middleware/jwtAuth.js';
import { resolveTenant, requireTenant } from './middleware/tenantContext.js';
import {
  computeMiddleware,
  computeMiddlewareNoQuota,
  crudMiddleware,
  readOnlyAuth,
  adminMiddleware,
} from './middleware/middlewareChains.js';
import { requirePermission, Permission } from './middleware/rbac.js';
import { auditLog } from './middleware/auditLog.js';
import { idempotencyKey } from './middleware/idempotency.js';
import { httpLogger, logger } from './utils/logger.js';
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
import tacticalConfigRoutes from './routes/tacticalConfigRoutes.js';
import signalRoutes from './routes/signalRoutes.js';
import tacticalGridRoutes from './routes/tacticalGridRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import adminKeyRoutes from './routes/adminKeyRoutes.js';
import rbacRoutes from './routes/rbacRoutes.js';
import authRoutes from './routes/authRoutes.js';
import featureFlagRoutes from './routes/featureFlagRoutes.js';
import apiKeyRoutes from './routes/apiKeyRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import portfolioRoutes from './routes/portfolioRoutes.js';
import configRoutes from './routes/configRoutes.js';
import runRoutes from './routes/runRoutes.js';
import orgRoutes from './routes/orgRoutes.js';
import billingRoutes, { billingWebhookHandler } from './routes/billingRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import errorReportRoutes from './routes/errorReportRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';
import { jobRoutes } from './routes/jobRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestTimeout } from './middleware/requestTimeout.js';
import { setupOpenApiUi } from './middleware/openapiUi.js';
import { setupBacktestWebSocket } from './services/backtestWs.js';

const app: express.Application = express();

// 信任反向代理的 X-Forwarded-For，使 express-rate-limit 取到真实客户端 IP
app.set('trust proxy', config.TRUST_PROXY_HOPS);

app.use(httpLogger);

// 将 request_id 放入 AsyncLocalStorage，使下游 callService 能注入 x-request-id
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = req.id !== undefined ? String(req.id) : undefined;
  if (requestId) {
    requestContextStorage.run({ requestId }, () => next());
  } else {
    next();
  }
});

// Prometheus HTTP 指标采集
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestDurationMicroseconds.observe(labels, duration);
    httpRequestsTotal.inc(labels);
  });
  next();
});

// P3-5: 全局请求超时（30s 上限），超时返回 503 Problem Detail
app.use(requestTimeout(30_000));

// 安全头 + CORS
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
          throw new Error('[CORS] 生产环境禁止 CORS_ORIGINS 通配');
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

// Stripe webhook 需原始请求体做签名校验，必须在 json 解析之前
app.post('/api/v1/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  void billingWebhookHandler(req, res);
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// P2-1: OpenAPI 请求/响应运行时验证（仅非生产环境）
// 开发/staging 环境启用，生产环境跳过（零运行时开销）
if (config.NODE_ENV !== 'production') {
  void (async () => {
    try {
      const OpenApiValidator = (await import('express-openapi-validator')).default;
      app.use(
        OpenApiValidator.middleware({
          apiSpec: './docs/openapi.yaml',
          validateRequests: true,
          validateResponses: true,
          ignorePaths: /\/metrics|\/health|\/ready|\/api\/v1\/errors/,
        }),
      );
    } catch (err) {
      // express-openapi-validator 未安装时跳过（生产环境正常路径）
      logger.warn({ err }, '[app] OpenAPI validator not available, skipping runtime validation');
    }
  })();
}

// 限流：计算端点 10/min，管理端点 30/min，认证端点 10/15min
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
app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth/register', registerLimiter);
app.use('/api/v1/auth/refresh', refreshLimiter);
// 健康检查在全局限流器之前，避免探活被 429 误杀
app.use('/api', healthRoutes);
app.use('/api/', apiLimiter);

// 路由挂载（仅 v1，legacy 路径已废弃）
app.use('/api/v1/data', ...readOnlyAuth, dataRoutes);
app.use(
  '/api/v1/data/manage',
  ...readOnlyAuth,
  requirePermission(Permission.DATA_READ),
  auditLog,
  idempotencyKey,
  dataManageRoutes,
);
app.use('/api/v1/backtest', ...computeMiddleware(Permission.BACKTEST_RUN), backtestRoutes);
app.use(
  '/api/v1/backtest-optimizer',
  ...computeMiddleware(Permission.OPTIMIZER_RUN),
  backtestOptimizerRoutes,
);
app.use('/api/v1/tactical', ...computeMiddleware(Permission.STRATEGY_MANAGE), tacticalRoutes);
app.use(
  '/api/v1/tactical/configs',
  ...crudMiddleware(Permission.STRATEGY_MANAGE),
  tacticalConfigRoutes,
);
app.use('/api/v1/signal', ...computeMiddlewareNoQuota(Permission.SIGNAL_READ), signalRoutes);
app.use(
  '/api/v1/tactical-grid',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  tacticalGridRoutes,
);

// 分析类路由合并挂载（ADR-042）：pca/letf/goal-optimizer/calculators/factor-regression
// 内部按子路径应用不同中间件链（computeMiddleware/computeMiddlewareNoQuota + Permission）
app.use('/api/v1', analysisRoutes);

app.use('/api/v1/admin', ...adminMiddleware(), adminRoutes);
// P2-03 不可篡改审计存储：管理后台审计日志查询（ADMIN_ACCESS 权限）
app.use('/api/v1/admin/audit-logs', ...adminMiddleware(), auditRoutes);
app.use('/api/v1/admin/keys', jwtAuth, auditLog, adminKeyRoutes);
app.use('/api/v1/admin', requireTenant, rbacRoutes);
app.use('/api/v1/auth', authRoutes);
// P1-3: 前端错误上报端点（无需认证，限流由全局 apiLimiter 覆盖）
app.use('/api/v1/errors', errorReportRoutes);
app.use('/api/v1/feature-flags', jwtAuth, featureFlagRoutes);

app.use('/api/v1/keys', ...crudMiddleware(Permission.ADMIN_ACCESS), apiKeyRoutes);
// P2-02 Webhook 管理：JWT + 租户 + ADMIN_ACCESS（与 API Key 管理同权限级别）
app.use('/api/v1/webhooks', ...crudMiddleware(Permission.ADMIN_ACCESS), webhookRoutes);
app.use('/api/v1/portfolios', ...crudMiddleware(Permission.BACKTEST_RUN), portfolioRoutes);
app.use('/api/v1/configs', ...crudMiddleware(Permission.BACKTEST_RUN), configRoutes);
app.use('/api/v1/runs', ...crudMiddleware(Permission.BACKTEST_RUN), runRoutes);
app.use('/api/v1/orgs', jwtAuth, resolveTenant, orgRoutes);
app.use('/api/v1/billing', jwtAuth, resolveTenant, billingRoutes);
app.use('/api/v1', jwtAuth, resolveTenant, jobRoutes);

// Swagger UI (P1-05) - 仅非生产环境
setupOpenApiUi(app);

// 静态文件 + SPA 回退
if (config.NODE_ENV === 'production' || config.SERVE_STATIC) {
  app.use(
    express.static(config.FRONTEND_DIST_DIR, {
      maxAge: config.NODE_ENV === 'production' ? '1y' : 0,
    }),
  );
  app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(config.FRONTEND_DIST_DIR + '/index.html');
  });
}

app.use(errorHandler);
app.use(notFoundHandler);

// P1-04: 创建 HTTP server 并挂载 WebSocket 实时进度端点 (/api/v1/ws/runs/:jobId)
const server = createServer(app);
setupBacktestWebSocket(server);

export { server };
export default app;
