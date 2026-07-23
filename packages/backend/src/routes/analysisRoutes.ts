/**
 * 分析类路由合并入口（ADR-042 路由整合）
 *
 * 合并以下 5 个原薄路由文件，消除重复的 `Router()` 实例化与 `export default` 样板：
 *   - letfRoutes.ts        → POST /letf/analyze
 *   - calculatorRoutes.ts  → POST /calculators/:type
 *   - pcaRoutes.ts         → POST /pca/analyze
 *   - goalOptimizerRoutes  → POST /goal-optimizer/optimize
 *   - factorRegressionRoutes → POST /analysis/factor-regression
 *
 * 挂载方式：app.ts 中 `app.use('/api/v1', analysisRoutes)`，
 * 子路径前缀保持与原路由一致，URL 不变。
 *
 * 中间件编排：通过 `router.use(subPath, ...middleware, subRouter)` 模式按子路径
 * 应用不同中间件链（computeMiddleware / computeMiddlewareNoQuota + 不同 Permission），
 * 等价于原 `app.use('/api/v1/pca', ...computeMiddleware(...), pcaRoutes)` 写法。
 *
 * 设计取舍：middleware 工厂函数（computeMiddleware / computeMiddlewareNoQuota）
 * 在 app.ts 中已有定义并用于其他路由（backtest/tactical/signal 等），此处局部复制
 * 避免循环依赖；两处定义必须保持一致（约 6 行）。
 */
import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { LETFRequest, PCARequest, GoalOptimizerRequest } from '@backtest/shared/types';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { sendProblem, ValidationError } from '../utils/errors.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { optionalJwtAuth, assignGuestAnalyst } from '../middleware/jwtAuth.js';
import { resolveTenant } from '../middleware/tenantContext.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { enforceQuota } from '../middleware/quota.js';
import { auditLog } from '../middleware/auditLog.js';
import { USAGE_METRIC } from '../config/planLimits.js';
import { sanitizeLog } from '../utils/logSanitizer.js';
import { letfAnalyzeSchema } from '../schemas/letf.js';
import { pcaAnalyzeSchema } from '../schemas/pca.js';
import { goalOptimizerSchema } from '../schemas/goalOptimizer.js';
import { executeLetfAnalyzeWithFetch } from '../application/analysis-orchestrator.js';
import { executePcaAnalyzeWithFetch } from '../application/analysis-orchestrator.js';
import { executeGoalOptimizeWithFetch } from '../application/analysis-orchestrator.js';
import { asyncRouteHandler } from './routeUtils.js';

// ---------------------------------------------------------------------------
// 局部中间件工厂（与 app.ts 同名函数等价，避免循环依赖）
// ---------------------------------------------------------------------------

const computeQuotaHandler: RequestHandler = (req, res, next) => {
  void enforceQuota(USAGE_METRIC.BACKTEST)(req, res, next);
};

function computeMiddleware(permission: Permission): RequestHandler[] {
  return [
    optionalJwtAuth,
    assignGuestAnalyst,
    resolveTenant,
    requirePermission(permission),
    computeQuotaHandler,
    auditLog,
  ];
}

function computeMiddlewareNoQuota(permission: Permission): RequestHandler[] {
  return [
    optionalJwtAuth,
    assignGuestAnalyst,
    resolveTenant,
    requirePermission(permission),
    auditLog,
  ];
}

// ---------------------------------------------------------------------------
// 主路由
// ---------------------------------------------------------------------------

const analysisRouter = Router();

// --- PCA: BACKTEST_RUN + 配额 ------------------------------------------------
const pcaSubRouter = Router();
pcaSubRouter.post(
  '/analyze',
  validate(pcaAnalyzeSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const body = req.body as PCARequest;
      const cleanTickers = body.tickers
        .map((t: string) => String(t).trim().toUpperCase())
        .filter(Boolean);
      logger.info(
        `[PCA] 开始分析: tickers=${cleanTickers.join(',')}, range=${body.startDate}~${body.endDate}`,
      );

      const result = await executePcaAnalyzeWithFetch(body);

      logger.info(
        `[PCA] 分析完成: ${result.eigenvalues.length} 个主成分, 耗时 ${Date.now() - startTime}ms`,
      );
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[PCA] 分析失败',
      code: 'PCA_ERROR',
      endpoint: 'pca',
    },
  ),
);
analysisRouter.use('/pca', ...computeMiddleware(Permission.BACKTEST_RUN), pcaSubRouter);

// --- LETF: BACKTEST_RUN + 配额 ------------------------------------------------
const letfSubRouter = Router();
letfSubRouter.post(
  '/analyze',
  validate(letfAnalyzeSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const body = req.body as LETFRequest;
      logger.info(`[LETF] 开始分析: letf=${body.letfTicker}, bench=${body.benchmarkTicker}`);

      const result = await executeLetfAnalyzeWithFetch(body);

      logger.info(`[LETF] 分析完成, 耗时 ${Date.now() - startTime}ms`);
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[LETF] 分析失败',
      code: 'LETF_ERROR',
      endpoint: 'letf',
    },
  ),
);
analysisRouter.use('/letf', ...computeMiddleware(Permission.BACKTEST_RUN), letfSubRouter);

// --- 目标优化: STRATEGY_MANAGE + 配额 -----------------------------------------
const goalOptimizerSubRouter = Router();
goalOptimizerSubRouter.post(
  '/optimize',
  validate(goalOptimizerSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const request = req.body as GoalOptimizerRequest;
      const tickers = request.assets
        .filter((a) => a.ticker?.trim())
        .map((a) => a.ticker.trim().toUpperCase());

      logger.info(
        `[GoalOptimizer] target=${request.targetAmount}, assets=${tickers.map((t) => sanitizeLog(t)).join(',')}`,
      );

      const result = await executeGoalOptimizeWithFetch(request);

      logger.info(`[GoalOptimizer] 完成, 耗时 ${Date.now() - startTime}ms`);
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[GoalOptimizer] 优化失败',
      code: 'GOAL_OPTIMIZER_ERROR',
      endpoint: 'goal-optimizer',
    },
  ),
);
analysisRouter.use(
  '/goal-optimizer',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  goalOptimizerSubRouter,
);

// --- 因子回归: BACKTEST_RUN 无配额 --------------------------------------------
const factorRegressionSubRouter = Router();
factorRegressionSubRouter.post(
  '/factor-regression',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { monthlyReturns, ffData, factors, startDate, endDate } = req.body;

      if (!monthlyReturns || !Array.isArray(monthlyReturns) || monthlyReturns.length === 0) {
        throw new ValidationError('monthlyReturns 不能为空');
      }
      if (!ffData || !Array.isArray(ffData) || ffData.length === 0) {
        throw new ValidationError('ffData 不能为空');
      }

      logger.info('[FactorRegression] 开始回归');
      const result = await callEngineStrict('/api/engine/factor-regression', {
        monthlyReturns,
        ffData,
        factors: factors || ['mktRF', 'smb', 'hml'],
        startDate: startDate || '',
        endDate: endDate || '',
      });
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[FactorRegression] 失败',
      code: 'FR_ERROR',
      endpoint: 'factor-regression',
    },
  ),
);
analysisRouter.use(
  '/analysis',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  factorRegressionSubRouter,
);

// --- 计算器: BACKTEST_RUN 无配额 ----------------------------------------------
const VALID_CALC_TYPES = ['cagr', 'swr', 'frontier'];
const calculatorSubRouter = Router();
calculatorSubRouter.post(
  '/:type',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { type } = req.params;
      const body = req.body;

      if (!VALID_CALC_TYPES.includes(type)) {
        sendProblem(res, 422, 'CALC_INVALID_TYPE');
        return;
      }

      logger.info(`[Calculator] 执行 ${type} 计算`);
      const result = await callEngineStrict('/api/engine/calculators', { type, ...body });
      res.json({ success: true, data: result });
    },
    {
      logMsg: '[Calculators] 失败',
      code: 'CALC_ERROR',
      endpoint: 'calculator',
    },
  ),
);
analysisRouter.use(
  '/calculators',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  calculatorSubRouter,
);

export default analysisRouter;
