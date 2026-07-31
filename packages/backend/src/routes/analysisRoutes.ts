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
 * 中间件工厂（computeMiddleware / computeMiddlewareNoQuota）从
 * `middleware/middlewareChains.ts` 导入，与 app.ts 共享同一份定义。
 */
import { Router, type Request, type Response } from 'express';
import type { LETFRequest, PCARequest, GoalOptimizerRequest } from '@backtest/shared/types';
import { logger, sanitizeLog } from '../utils/logger.js';
import { validate } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { computeMiddleware, computeMiddlewareNoQuota } from '../middleware/middlewareChains.js';
import { Permission } from '../middleware/rbac.js';
import {
  pcaAnalyzeSchema,
  letfAnalyzeSchema,
  goalOptimizerSchema,
  factorRegressionSchema,
  calculatorBodySchema,
} from '../schemas/analysisSchemas.js';
import { executeLetfAnalyzeWithFetch } from '../application/analysis-orchestrator.js';
import { executePcaAnalyzeWithFetch } from '../application/analysis-orchestrator.js';
import { executeGoalOptimizeWithFetch } from '../application/analysis-orchestrator.js';
import { asyncRouteHandler } from './routeUtils.js';

const analysisRouter = Router();

/** 分析类端点统一骨架：开始日志 → 执行 → 完成耗时日志 → 统一响应（消除 3 处 WithFetch 端点重复样板）。 */
function timedCompute(
  metric: string,
  code: string,
  startLog: (req: Request) => string,
  fn: (req: Request) => Promise<unknown>,
) {
  return asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      logger.info(startLog(req));
      const result = await fn(req);
      logger.info(`[${metric}] 完成, 耗时 ${Date.now() - startTime}ms`);
      res.json({ success: true, data: result });
    },
    { logMsg: `[${metric}] 失败`, code, endpoint: metric },
  );
}

// --- PCA: BACKTEST_RUN + 配额 ------------------------------------------------
analysisRouter.post(
  '/pca/analyze',
  ...computeMiddleware(Permission.BACKTEST_RUN),
  validate(pcaAnalyzeSchema),
  timedCompute(
    'PCA',
    'PCA_ERROR',
    (req) => {
      const cleanTickers = (req.body as PCARequest).tickers
        .map((t: string) => String(t).trim().toUpperCase())
        .filter(Boolean);
      return `[PCA] 开始分析: tickers=${cleanTickers.join(',')}, range=${(req.body as PCARequest).startDate}~${(req.body as PCARequest).endDate}`;
    },
    async (req) => executePcaAnalyzeWithFetch(req.body as PCARequest),
  ),
);

// --- LETF: BACKTEST_RUN + 配额 ------------------------------------------------
analysisRouter.post(
  '/letf/analyze',
  ...computeMiddleware(Permission.BACKTEST_RUN),
  validate(letfAnalyzeSchema),
  timedCompute(
    'LETF',
    'LETF_ERROR',
    (req) => {
      const body = req.body as LETFRequest;
      return `[LETF] 开始分析: letf=${body.letfTicker}, bench=${body.benchmarkTicker}`;
    },
    async (req) => executeLetfAnalyzeWithFetch(req.body as LETFRequest),
  ),
);

// --- 目标优化: STRATEGY_MANAGE + 配额 -----------------------------------------
analysisRouter.post(
  '/goal-optimizer/optimize',
  ...computeMiddleware(Permission.STRATEGY_MANAGE),
  validate(goalOptimizerSchema),
  timedCompute(
    'GoalOptimizer',
    'GOAL_OPTIMIZER_ERROR',
    (req) => {
      const request = req.body as GoalOptimizerRequest;
      const tickers = request.assets
        .filter((a) => a.ticker?.trim())
        .map((a) => a.ticker.trim().toUpperCase());
      return `[GoalOptimizer] target=${request.targetAmount}, assets=${tickers.map((t) => sanitizeLog(t)).join(',')}`;
    },
    async (req) => executeGoalOptimizeWithFetch(req.body as GoalOptimizerRequest),
  ),
);

// --- 因子回归: BACKTEST_RUN 无配额 --------------------------------------------
analysisRouter.post(
  '/analysis/factor-regression',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  validate(factorRegressionSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { monthlyReturns, ffData, factors, startDate, endDate } = req.body;

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

// --- 计算器: BACKTEST_RUN 无配额 ----------------------------------------------
const VALID_CALC_TYPES = ['cagr', 'swr', 'frontier'];
analysisRouter.post(
  '/calculators/:type',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  validate(calculatorBodySchema),
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

export default analysisRouter;
