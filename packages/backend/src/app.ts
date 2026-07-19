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
import factorRegressionRoutes from './routes/factorRegressionRoutes.js';
import calculatorRoutes from './routes/calculatorRoutes.js';
import { jobRoutes } from './routes/jobRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

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

// 中间件链工厂 — 认证与权限始终生效（开发环境可通过 DEV_SKIP_AUTH 旁路，注入 analyst 角色）
const computeAuth = jwtAuth;
const computePermission = (permission: Permission): express.RequestHandler =>
  requirePermission(permission);
const computeQuota: express.RequestHandler = (req, res, next) => {
  void enforceQuota(USAGE_METRIC.BACKTEST)(req, res, next);
};
function computeMiddleware(permission: Permission): express.RequestHandler[] {
  return [computeAuth, resolveTenant, computePermission(permission), computeQuota, auditLog];
}
function computeMiddlewareNoQuota(permission: Permission): express.RequestHandler[] {
  return [computeAuth, resolveTenant, computePermission(permission), auditLog];
}
function crudMiddleware(permission: Permission): express.RequestHandler[] {
  return [jwtAuth, resolveTenant, requireTenant, requirePermission(permission)];
}

// 路由挂载（仅 v1，legacy 路径已废弃）
app.use('/api/v1/data', optionalJwtAuth, assignGuestReadonly, dataRoutes);
app.use(
  '/api/v1/data/manage',
  optionalJwtAuth,
  assignGuestReadonly,
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
app.use('/api/v1/pca', ...computeMiddleware(Permission.BACKTEST_RUN), pcaRoutes);
app.use('/api/v1/signal', ...computeMiddlewareNoQuota(Permission.SIGNAL_READ), signalRoutes);
app.use('/api/v1/letf', ...computeMiddleware(Permission.BACKTEST_RUN), letfRoutes);
app.use(
  '/api/v1/tactical-grid',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  tacticalGridRoutes,
);
app.use(
  '/api/v1/goal-optimizer',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  goalOptimizerRoutes,
);
app.use(
  '/api/v1/analysis',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  factorRegressionRoutes,
);
app.use(
  '/api/v1/calculators',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  calculatorRoutes,
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

app.use('/api/v1/keys', ...crudMiddleware(Permission.ADMIN_ACCESS), apiKeyRoutes);
app.use('/api/v1/portfolios', ...crudMiddleware(Permission.BACKTEST_RUN), portfolioRoutes);
app.use('/api/v1/configs', ...crudMiddleware(Permission.BACKTEST_RUN), configRoutes);
app.use('/api/v1/runs', ...crudMiddleware(Permission.BACKTEST_RUN), runRoutes);
app.use('/api/v1/orgs', jwtAuth, resolveTenant, orgRoutes);
app.use('/api/v1/billing', jwtAuth, resolveTenant, billingRoutes);
app.use('/api/v1', jwtAuth, resolveTenant, jobRoutes);

app.use('/api/v1', debugRoutes);

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

export default app;
