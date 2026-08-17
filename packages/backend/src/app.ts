import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { config } from './config/index.js';
import { jwtAuth, auditLog, idempotencyKey } from './middleware/jwtAuth.js';
import { resolveTenant } from './middleware/tenantContext.js';
import { computeMiddleware, readOnlyAuth } from './middleware/middlewareChains.js';
import { requirePermission, Permission } from './middleware/rbac.js';
import { enforceOrgActive } from './middleware/quota.js';
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
  COMPUTE_PATHS,
} from './utils/rateLimiter.js';
import dataRoutes from './routes/dataRoutes.js';
import dataManageRoutes from './routes/dataManageRoutes.js';
import backtestRoutes from './routes/backtestRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import authRoutes from './routes/authRoutes.js';
import orgRoutes from './routes/orgRoutes.js';
import billingRoutes, { billingWebhookHandler } from './routes/billingRoutes.js';
import { jobRoutes } from './routes/jobRoutes.js';
import apiKeyRoutes from './routes/apiKeyRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import platformRoutes from './routes/platformRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import { errorHandler, notFoundHandler, requestTimeout } from './middleware/errorHandler.js';
import { sendProblem } from './utils/errors.js';
import { buildCspHeader } from './utils/csp.js';
import { brotliCompress, createEarlyHintsMiddleware } from './middleware/brotliCompress.js';
import { setupOpenApiUi } from './middleware/miscMiddleware.js';
import { setupBacktestWebSocket } from './services/backtestWs.js';

const app: express.Application = express();

app.set('trust proxy', config.TRUST_PROXY_HOPS); // 信任 X-Forwarded-For，使 rate-limit 取到真实客户端 IP

app.use(httpLogger);

app.use((req: Request, _res: Response, next: NextFunction) => {
  requestContextStorage.run({ requestId: String(req.id) }, () => next());
});

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

// 同步计算端点调用引擎最长可达 ENGINE_TIMEOUT_MS，须大于引擎客户端超时让其先返回错误而非 408
app.use(
  requestTimeout((req) =>
    COMPUTE_PATHS.some((p) => req.path.startsWith(p)) ? config.ENGINE_TIMEOUT_MS + 5_000 : 30_000,
  ),
);

app.use(createEarlyHintsMiddleware());

app.use(
  helmet({
    contentSecurityPolicy: false, // CSP 按请求生成 nonce，见下方中间件
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);
app.use((req: Request, res: Response, next: NextFunction) => {
  const nonce = randomBytes(16).toString('base64');
  res.locals.nonce = nonce;
  const isPage =
    !req.path.startsWith('/api/') &&
    !req.path.startsWith('/assets/') &&
    req.path !== '/favicon.svg';
  res.setHeader('Content-Security-Policy', buildCspHeader(nonce, isPage));
  next();
});
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

app.post('/api/v1/billing/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  billingWebhookHandler(req, res).catch((err) => {
    logger.error({ err }, '[app] Stripe webhook handler unhandled rejection');
    if (!res.headersSent) sendProblem(res, 500, 'STRIPE_WEBHOOK_ERROR');
  });
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser()); // P0-1 BFF 模式：解析 httpOnly Cookie 中的 Refresh Token

// 计算端点限流：单次挂载，避免 backtest 前缀与 backtest-optimizer 等重叠路径被计双次；
// 仅纯 /backtest 前缀的 GET（runs 列表等）跳过，重叠子路径（backtest-optimizer 等）照常限流
app.use('/api/v1', (req, _res, next) => {
  // req.path 在此已被剥去 /api/v1 挂载前缀，须用 originalUrl 匹配 COMPUTE_PATHS（含查询串不影响前缀匹配）
  const paths = COMPUTE_PATHS.filter((p) => req.originalUrl.startsWith(p));
  if (paths.length === 0) return next();
  if (req.method === 'GET' && paths.length === 1 && paths[0] === '/api/v1/backtest') return next();
  computeLimiter(req, _res, next);
});
app.use('/api/v1/admin', adminLimiter);
app.use('/api/v1/data/manage', adminLimiter);
app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth/register', registerLimiter);
app.use('/api/v1/auth/refresh', refreshLimiter);
app.use('/api', healthRoutes); // 健康检查在全局限流器之前，避免探活被 429 误杀
app.use('/api/', apiLimiter);

app.use(
  '/api/v1/data/manage',
  ...readOnlyAuth,
  requirePermission(Permission.DATA_READ),
  auditLog,
  idempotencyKey,
  dataManageRoutes,
);
app.use('/api/v1/data', ...readOnlyAuth, dataRoutes);
app.use('/api/v1/backtest', ...computeMiddleware(Permission.BACKTEST_RUN), backtestRoutes);
// 分析/计算/密钥/工作台/平台端点合并挂载（ADR-011）：内部按子路径应用不同中间件链
app.use('/api/v1', analysisRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/orgs', jwtAuth, resolveTenant, enforceOrgActive(), orgRoutes);
app.use('/api/v1/billing', jwtAuth, resolveTenant, enforceOrgActive(), billingRoutes);
app.use('/api/v1', jobRoutes);
app.use('/api/v1', apiKeyRoutes);
app.use('/api/v1', workspaceRoutes);
app.use('/api/v1', platformRoutes);

setupOpenApiUi(app);

// 静态文件 — 只匹配 /assets/ 等非 HTML 路径（HTML 由 SSR 或 SPA fallback 处理）
if (config.NODE_ENV === 'production' || config.SERVE_STATIC) {
  app.use((req, res, next) => {
    if (req.path.startsWith('/assets/') || req.path === '/favicon.svg') {
      express.static(config.FRONTEND_DIST_DIR, {
        maxAge: config.NODE_ENV === 'production' ? '1y' : 0,
      })(req, res, next);
    } else {
      next();
    }
  });
}

if (config.NODE_ENV === 'production' || config.SERVE_STATIC) {
  const { ssrMiddleware } = await import('./ssrMiddleware.js');
  // ssrMiddleware 总在内部兜底 sendFile(SPA)，故无需第二条路由
  app.get(/^\/(?!api\/)(?!assets\/)(?!favicon)/, ssrMiddleware);
}

app.use(errorHandler);
app.use(notFoundHandler);

// P1-04: 创建 HTTP server 并挂载 WebSocket 实时进度端点 (/api/v1/ws/runs/:jobId)
const server = createServer(app);
// backtestWs 用于优雅停机时断开活动连接（否则 server.close() 会等 WS socket 直到超时强杀）
export const backtestWs = setupBacktestWebSocket(server);

export { server };
export default app;
