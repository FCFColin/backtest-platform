import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { config } from './config/index.js';
import { jwtAuth, auditLog, idempotencyKey } from './middleware/jwtAuth.js';
import { resolveTenant, requireTenant } from './middleware/tenantContext.js';
import {
  computeMiddleware,
  computeMiddlewareNoQuota,
  crudMiddleware,
  readOnlyAuth,
  adminMiddleware,
} from './middleware/middlewareChains.js';
import { requirePermission, Permission } from './middleware/rbac.js';
import { httpLogger, logger } from './utils/logger.js';
import { requestContextStorage } from './utils/requestContext.js';
import {
  httpRequestDurationMicroseconds,
  httpRequestsTotal,
  getRoutePattern,
} from './utils/metrics.js';
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
import customTickerRoutes from './routes/customTickerRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
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
import { errorHandler, notFoundHandler, requestTimeout } from './middleware/errorHandler.js';
import { brotliCompress, createEarlyHintsMiddleware } from './middleware/brotliCompress.js';
import { setupOpenApiUi } from './middleware/miscMiddleware.js';
import { setupBacktestWebSocket } from './services/backtestWs.js';

const app: express.Application = express();

app.set('trust proxy', config.TRUST_PROXY_HOPS); // 信任 X-Forwarded-For，使 rate-limit 取到真实客户端 IP

app.use(httpLogger);

// 将 request_id 放入 AsyncLocalStorage，使下游 callService 能注入 x-request-id
app.use((req: Request, _res: Response, next: NextFunction) => {
  const requestId = req.id !== undefined ? String(req.id) : undefined;
  if (requestId) requestContextStorage.run({ requestId }, () => next());
  else next();
});

// Prometheus HTTP 指标采集
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    try {
      const labels = {
        method: req.method,
        route: getRoutePattern(req),
        status_code: String(res.statusCode),
      };
      httpRequestDurationMicroseconds.observe(labels, (Date.now() - start) / 1000);
      httpRequestsTotal.inc(labels);
    } catch (err) {
      logger.warn({ err }, 'Failed to record HTTP metrics');
    }
  });
  next();
});

// P3-5: 全局请求超时（30s 上限），超时返回 503 Problem Detail
app.use(requestTimeout(30_000));

// 103 Early Hints — 在静态文件中间件之前注册，确保 HTML 响应前推送关键资源链接
app.use(createEarlyHintsMiddleware());

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
        if (config.NODE_ENV === 'production')
          throw new Error('[CORS] 生产环境禁止 CORS_ORIGINS 通配');
        return cors();
      })()
    : cors({ origin: config.CORS_ORIGINS });
app.use(corsOptions);

app.use(brotliCompress);

// Stripe webhook 需原始请求体做签名校验，必须在 json 解析之前
app.post('/api/v1/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  billingWebhookHandler(req, res).catch((err) => {
    logger.error({ err }, '[app] Stripe webhook handler unhandled rejection');
    if (!res.headersSent) res.status(500).json({ received: false });
  });
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser()); // P0-1 BFF 模式：解析 httpOnly Cookie 中的 Refresh Token

// P2-1: OpenAPI 运行时验证（仅非生产环境，生产零运行时开销）
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
      logger.warn({ err }, '[app] OpenAPI validator not available, skipping runtime validation');
    }
  })();
}

// 限流：计算端点 10/min，管理端点 30/min，认证端点 10/15min
app.use('/api/v1/backtest', (req, _res, next) => {
  if (req.method === 'GET') return next();
  computeLimiter(req, _res, next);
});
for (const p of [
  '/api/v1/backtest-optimizer',
  '/api/v1/tactical',
  '/api/v1/pca',
  '/api/v1/signal',
  '/api/v1/letf',
  '/api/v1/tactical-grid',
  '/api/v1/goal-optimizer',
])
  app.use(p, computeLimiter);
app.use('/api/v1/admin', adminLimiter);
app.use('/api/v1/data/manage', adminLimiter);
app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth/register', registerLimiter);
app.use('/api/v1/auth/refresh', refreshLimiter);
app.use('/api', healthRoutes); // 健康检查在全局限流器之前，避免探活被 429 误杀
app.use('/api/', apiLimiter);

// 路由挂载（仅 v1，legacy 路径已废弃）
app.use('/api/v1/data', ...readOnlyAuth, dataRoutes);
app.use('/api/v1/data/custom', ...readOnlyAuth, customTickerRoutes);
app.use('/api/v1/announcements', announcementRoutes);
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
// 分析类路由合并挂载（ADR-042）：内部按子路径应用不同中间件链
app.use('/api/v1', analysisRoutes);
app.use('/api/v1/admin', ...adminMiddleware(), adminRoutes);
app.use('/api/v1/admin/audit-logs', ...adminMiddleware(), auditRoutes); // P2-03 审计日志查询（ADMIN_ACCESS）
app.use('/api/v1/admin/keys', jwtAuth, auditLog, adminKeyRoutes);
app.use('/api/v1/admin', requireTenant, rbacRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/errors', errorReportRoutes); // 前端错误上报，无需认证（全局 apiLimiter 覆盖）
app.use('/api/v1/feature-flags', jwtAuth, featureFlagRoutes);
app.use('/api/v1/keys', ...crudMiddleware(Permission.ADMIN_ACCESS), apiKeyRoutes);
app.use('/api/v1/webhooks', ...crudMiddleware(Permission.ADMIN_ACCESS), webhookRoutes); // P2-02 与 API Key 同权限级别
app.use('/api/v1/portfolios', ...crudMiddleware(Permission.BACKTEST_RUN), portfolioRoutes);
app.use('/api/v1/configs', ...crudMiddleware(Permission.BACKTEST_RUN), configRoutes);
app.use('/api/v1/runs', ...crudMiddleware(Permission.BACKTEST_RUN), runRoutes);
app.use('/api/v1/orgs', jwtAuth, resolveTenant, orgRoutes);
app.use('/api/v1/billing', jwtAuth, resolveTenant, billingRoutes);
app.use('/api/v1', jwtAuth, resolveTenant, jobRoutes);

// Swagger UI (P1-05) - 仅非生产环境
setupOpenApiUi(app);

// SSR 渲染（生产/静态服务模式）— 在静态文件之前，HTML 请求走 SSR，失败降级 index.html
if (config.NODE_ENV === 'production' || config.SERVE_STATIC) {
  const { ssrMiddleware } = await import('./ssrMiddleware.js');
  app.get(/^\/(?!api\/)(?!assets\/)(?!favicon)/, ssrMiddleware);
  app.get(/^\/(?!api\/)(?!assets\/)(?!favicon)/, (_req: Request, res: Response) =>
    res.sendFile(config.FRONTEND_DIST_DIR + '/index.html'),
  );
}

// 静态文件 — 只匹配 /assets/ 等非 HTML 路径（HTML 由 SSR 或 SPA fallback 处理）
if (config.NODE_ENV === 'production' || config.SERVE_STATIC) {
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/assets/') ||
      req.path === '/favicon.svg' ||
      req.path === '/manifest.webmanifest' ||
      req.path === '/registerSW.js' ||
      req.path === '/sw.js' ||
      req.path.startsWith('/workbox-')
    ) {
      express.static(config.FRONTEND_DIST_DIR, {
        maxAge: config.NODE_ENV === 'production' ? '1y' : 0,
      })(req, res, next);
    } else {
      next();
    }
  });
}

app.use(errorHandler);
app.use(notFoundHandler);

// P1-04: 创建 HTTP server 并挂载 WebSocket 实时进度端点 (/api/v1/ws/runs/:jobId)
const server = createServer(app);
setupBacktestWebSocket(server);

export { server };
export default app;
