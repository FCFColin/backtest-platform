import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { jwtAuth, optionalJwtAuth, assignGuestReadonly } from '../middleware/jwtAuth.js';
import { resolveTenant, requireTenant } from '../middleware/tenantContext.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { enforceQuota } from '../middleware/quota.js';
import { USAGE_METRIC } from '../config/planLimits.js';
import { auditLog } from '../middleware/auditLog.js';
import { idempotencyKey } from '../middleware/idempotency.js';
import dataRoutes from './dataRoutes.js';
import dataManageRoutes from './dataManageRoutes.js';
import backtestRoutes from './backtestRoutes.js';
import backtestOptimizerRoutes from './backtestOptimizerRoutes.js';
import tacticalRoutes from './tacticalRoutes.js';
import pcaRoutes from './pcaRoutes.js';
import signalRoutes from './signalRoutes.js';
import letfRoutes from './letfRoutes.js';
import tacticalGridRoutes from './tacticalGridRoutes.js';
import goalOptimizerRoutes from './goalOptimizerRoutes.js';
import adminRoutes from './adminRoutes.js';
import authRoutes from './authRoutes.js';
import apiKeyRoutes from './apiKeyRoutes.js';
import portfolioRoutes from './portfolioRoutes.js';
import configRoutes from './configRoutes.js';
import runRoutes from './runRoutes.js';
import orgRoutes from './orgRoutes.js';
import billingRoutes from './billingRoutes.js';
import debugRoutes from './debugRoutes.js';
import { jobRoutes } from './jobRoutes.js';

// for esm mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerRoutes(app: express.Application): void {
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

  app.use('/api/v1/data', dataRoutes);
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
    '/api/data': ['/data', dataRoutes],
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
    '/api/keys': [
      '/keys',
      jwtAuth,
      resolveTenant,
      requireTenant,
      requirePermission(Permission.ADMIN_ACCESS),
      apiKeyRoutes,
    ],
    '/api/portfolios': [
      '/portfolios',
      jwtAuth,
      resolveTenant,
      requireTenant,
      requirePermission(Permission.BACKTEST_RUN),
      portfolioRoutes,
    ],
    '/api/configs': [
      '/configs',
      jwtAuth,
      resolveTenant,
      requireTenant,
      requirePermission(Permission.BACKTEST_RUN),
      configRoutes,
    ],
    '/api/runs': [
      '/runs',
      jwtAuth,
      resolveTenant,
      requireTenant,
      requirePermission(Permission.BACKTEST_RUN),
      runRoutes,
    ],
    '/api/orgs': ['/orgs', jwtAuth, resolveTenant, orgRoutes],
    '/api/billing': ['/billing', jwtAuth, resolveTenant, billingRoutes],
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
    const distPath = path.resolve(__dirname, '../../dist');
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
   * 前端无需为不同 HTTP 状态码编写不同的错误解析代码。
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
}
