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
analysisRouter.use(
  '/calculators',
  ...computeMiddlewareNoQuota(Permission.BACKTEST_RUN),
  calculatorSubRouter,
);

export default analysisRouter;