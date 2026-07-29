/**
 * 回测路由 — 纯 HTTP 适配层（薄路由模式）。
 *
 * 路由只负责：请求解析 → 调用 application 层 → 响应格式化。
 * 所有校验、数据准备、引擎调用编排逻辑在 application 层中。
 *
 * POST /api/backtest/portfolio        — 组合回测（异步 202，X-Backtest-Sync: true 走同步 200）
 * GET  /api/backtest/runs/:jobId       — 查询异步回测任务状态（P0-03）
 * POST /api/backtest/portfolio/series — 从缓存补全 tab 序列
 * POST /api/backtest/analysis         — 资产分析
 * POST /api/backtest/monte-carlo      — 蒙特卡洛模拟
 * POST /api/backtest/optimize         — 组合优化
 * POST /api/backtest/efficient-frontier — 有效前沿
 * GET  /api/backtest/search           — 搜索 ticker
 */

import { Router, type Request, type Response } from 'express';
import type { Portfolio, BacktestParameters } from '@backtest/shared';
import { runAnalysis } from '../application/analysis-orchestrator.js';
import type { Warning } from '../application/backtest-helpers.js';
import { runMonteCarlo } from '../application/montecarlo-service.js';
import { runOptimization, runEfficientFrontier } from '../application/optimize-service.js';
import { extractBacktestSeries } from '../application/backtest/compressBacktestResult.js';
import {
  backtestCacheKey,
  getBacktestResultCache,
} from '../application/backtest/backtestResultCache.js';
import { searchTickers } from '../infrastructure/dataFacade.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { recordBacktestRequest } from '../utils/metrics.js';
import { asyncRouteHandler, crudRouteHandler, ownerOf } from './routeUtils.js';
import type { AuthenticatedRequest } from '../middleware/authTypes.js';
import {
  backtestQueue,
  type BacktestJobData,
  type BacktestJobResult,
} from '../queues/backtestQueue.js';
import { validate } from '../middleware/validate.js';
import {
  portfolioBacktestSchema,
  portfolioSeriesSchema,
  analysisSchema,
  monteCarloSchema,
  optimizeSchema,
  efficientFrontierSchema,
} from '../schemas/backtest.js';

const router = Router();

/**
 * 构建回测统一响应体（success + data + 可选 warnings/dateRange）。
 *
 * @param data - 计算结果
 * @param warnings - 警告数组（字符串自动转为 { code: 'WARNING', message } 结构）
 * @param dateRange - 可选的日期范围信息
 * @returns 统一响应对象
 */
function buildBacktestResponse(
  data: unknown,
  warnings: (Warning | string)[] = [],
  dateRange?: unknown,
): Record<string, unknown> {
  const response: Record<string, unknown> = { success: true, data };
  if (warnings.length > 0) {
    response.warnings = warnings.map((w: Warning | string): Warning =>
      typeof w === 'string' ? { code: 'WARNING', message: w } : w,
    );
  }
  if (dateRange) {
    response.dateRange = dateRange;
  }
  return response;
}

// ---------------------------------------------------------------------------
// 搜索 ticker
// ---------------------------------------------------------------------------

router.get(
  '/search',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const query = req.query.query as string;
      const limit = parseInt(req.query.limit as string, 10) || 10;

      if (!query || query.trim().length === 0) {
        sendProblem(res, 422, 'MISSING_PARAMS');
        return;
      }

      const results = await searchTickers(query.trim(), undefined, req.tenantId);
      res.json({ success: true, data: results.slice(0, limit) });
    },
    {
      logMsg: 'Ticker search error',
      code: 'SEARCH_ERROR',
      endpoint: 'backtest-search',
    },
  ),
);

// ---------------------------------------------------------------------------
// 组合回测 — 编排逻辑在 backtest-service.runPortfolioBacktest 中
// P0-02：统一异步模式（202 + 入队），废弃同步路径（BACKTEST_SYNC_WAIT_MS 已移除）。
// 队列不可用时 fail-closed 返回 503（ADR-031），不再回退到同步执行。
// 前端通过 useBacktestWs（WebSocket + 轮询降级）订阅任务进度。
// ---------------------------------------------------------------------------

router.post(
  '/portfolio',
  validate(portfolioBacktestSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { portfolios, parameters } = req.body as {
        portfolios: Portfolio[];
        parameters: BacktestParameters;
      };
      const authReq = req as AuthenticatedRequest;
      const ownerUserId = ownerOf(authReq);
      const tenantId = authReq.tenantId;
      const userId = authReq.user?.sub;

      // P0-02：统一异步路径——入队后立即返回 202 Accepted。
      // 废弃的同步路径（X-Backtest-Sync: true）已移除，多实例场景下同步等待无法保证
      // 请求路由到同一引擎实例。前端通过 WebSocket + 轮询降级获取结果。
      try {
        const job = await backtestQueue.add('portfolio', {
          type: 'portfolio',
          payload: { portfolios, parameters },
          userId,
          tenantId,
          ownerUserId,
        } as BacktestJobData);

        res.status(202).json({
          success: true,
          data: {
            jobId: job.id,
            status: 'queued',
            statusUrl: `/api/v1/backtest/runs/${job.id}`,
          },
        });
        recordBacktestRequest('portfolio', 'async', 'success');
      } catch (queueError) {
        // P0-02：队列不可用时 fail-closed 返回 503（ADR-031），不再回退到同步执行。
        // 同步回退在引擎多实例场景下无法保证请求路由到同一实例，且阻塞事件循环。
        logger.error(
          { err: (queueError as Error).message },
          '[backtest] BullMQ 队列不可用，fail-closed 返回 503',
        );
        recordBacktestRequest('portfolio', 'async', 'queue_error');
        sendProblem(res, 503, 'SERVICE_TEMPORARILY_UNAVAILABLE', 'Service temporarily unavailable', {
          detail: 'Compute queue temporarily unavailable. Please retry later.',
          headers: { 'Retry-After': '30' },
        });
      }
    },
    {
      logMsg: 'Portfolio backtest error',
      code: 'BACKTEST_ERROR',
      endpoint: 'portfolio-backtest',
    },
  ),
);

// ---------------------------------------------------------------------------
// 异步任务状态查询 — GET /api/v1/backtest/runs/:jobId（P0-03）
// 返回 BullMQ job 状态 + 进度 + 结果（完成时）或错误（失败时）。
// 状态映射：waiting/active → running, completed → completed, failed → failed, delayed → queued
// ---------------------------------------------------------------------------

/**
 * 将 BullMQ 内部状态映射为对客户端公开的简化状态。
 *
 * @param bullmqState - BullMQ job.getState() 返回的内部状态字符串
 * @returns 公开状态：queued | running | completed | failed
 */
function mapJobState(bullmqState: string): 'queued' | 'running' | 'completed' | 'failed' {
  if (bullmqState === 'completed') return 'completed';
  if (bullmqState === 'failed') return 'failed';
  if (bullmqState === 'delayed') return 'queued';
  // waiting / active / wait-priority / prioritized 等均视为 running（已被 worker 拾取或即将拾取）
  return 'running';
}

/**
 * 校验调用方是否有权访问该 job（所有者本人 / admin / 同租户）。
 * 越权访问返回 404（不泄露任务是否存在），与 jobRoutes.ts 一致。
 *
 * @returns true 表示已拒绝（响应已发送），false 表示授权通过
 */
function authorizeBacktestJob(
  res: Response,
  job: NonNullable<Awaited<ReturnType<typeof backtestQueue.getJob>>>,
  authReq: AuthenticatedRequest,
): boolean {
  const requester = authReq.user;
  if (!requester) return false; // 未认证请求由上游中间件拦截，此处放行匿名场景（无 user 时）
  const ownerId = job.data?.userId;
  const jobTenant = job.data?.tenantId;
  const hasOwnership =
    (ownerId !== undefined && ownerId === requester.sub) || requester.role === 'admin';
  const passesTenantCheck =
    !jobTenant || jobTenant === authReq.tenantId || requester.platform_admin === true;
  if (!hasOwnership || !passesTenantCheck) {
    sendProblem(res, 404, 'JOB_NOT_FOUND');
    return true;
  }
  return false;
}

router.get(
  '/runs/:jobId',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const jobId = req.params.jobId;
      if (!jobId) {
        sendProblem(res, 400, 'INVALID_ID');
        return;
      }

      const job = await backtestQueue.getJob(jobId);
      if (!job) {
        sendProblem(res, 404, 'JOB_NOT_FOUND');
        return;
      }

      // 越权访问返回 404（不泄露任务是否存在），与 jobRoutes.ts 行为一致
      if (authorizeBacktestJob(res, job, authReq)) return;

      const bullmqState = await job.getState();
      const status = mapJobState(bullmqState);
      const progress = typeof job.progress === 'number' ? job.progress : 0;

      const data: Record<string, unknown> = {
        jobId,
        status,
        progress,
      };

      if (status === 'completed' && job.returnvalue) {
        const returnValue = job.returnvalue as BacktestJobResult;
        if (returnValue.status === 'completed' && returnValue.result) {
          // portfolio job 的 result 形状：{ data, warnings, dateRange }
          data.result = returnValue.result;
        } else if (returnValue.status === 'failed') {
          data.error = returnValue.error;
        }
      } else if (status === 'failed') {
        data.error = job.failedReason || 'Job execution failed';
      }

      res.json({ success: true, data });
    },
    {
      logMsg: '[backtestRoutes] 查询异步任务状态失败',
      code: 'JOB_STATUS_ERROR',
    },
  ),
);
// ---------------------------------------------------------------------------
// 从 LRU 缓存补全 tab 序列
// ---------------------------------------------------------------------------

router.post(
  '/portfolio/series',
  validate(portfolioSeriesSchema),
  asyncRouteHandler(
    async (req, res) => {
      const { portfolios, parameters, series } = req.body as {
        portfolios: Portfolio[];
        parameters: BacktestParameters;
        series: string[];
      };

      const cacheKey = backtestCacheKey(
        portfolios,
        parameters,
        (req as AuthenticatedRequest).tenantId,
      );
      const cached = await getBacktestResultCache(cacheKey);
      if (!cached) {
        sendProblem(res, 404, 'BACKTEST_CACHE_MISS');
        return;
      }

      res.json({
        success: true,
        data: {
          portfolios: extractBacktestSeries(cached, series),
        },
      });
    },
    {
      logMsg: 'Portfolio series error',
      code: 'SERIES_ERROR',
      endpoint: 'portfolio-series',
    },
  ),
);

// ---------------------------------------------------------------------------
// 资产分析
// ---------------------------------------------------------------------------

router.post(
  '/analysis',
  validate(analysisSchema),
  asyncRouteHandler(
    async (req, res) => {
      const { tickers, parameters } = req.body as {
        tickers: string[];
        parameters: BacktestParameters;
      };

      const result = await runAnalysis(tickers, parameters);
      recordBacktestRequest('analysis', 'sync', 'success');

      const response: Record<string, unknown> = { success: true, data: result };
      const resultWithExtra = result as Record<string, unknown> & {
        warnings?: Warning[];
        dateRange?: unknown;
      };
      if (resultWithExtra.warnings) {
        response.warnings = resultWithExtra.warnings;
        delete (result as Record<string, unknown>).warnings;
      }
      if (resultWithExtra.dateRange) {
        response.dateRange = resultWithExtra.dateRange;
        delete (result as Record<string, unknown>).dateRange;
      }
      res.json(response);
    },
    {
      logMsg: 'Analysis error',
      code: 'ANALYSIS_ERROR',
      endpoint: 'analysis',
    },
  ),
);

// ---------------------------------------------------------------------------
// 蒙特卡洛模拟
// ---------------------------------------------------------------------------

router.post(
  '/monte-carlo',
  validate(monteCarloSchema),
  asyncRouteHandler(
    async (req, res) => {
      const startTime = Date.now();
      const { portfolio, portfolios, parameters, mcParams } = req.body as {
        portfolio?: Portfolio;
        portfolios?: Portfolio[];
        parameters: BacktestParameters;
        mcParams?: Record<string, unknown>;
      };

      const portfolioList = (portfolios || (portfolio ? [portfolio] : undefined))!;

      const { data, warnings, dateRange } = await runMonteCarlo(
        portfolioList,
        parameters,
        mcParams,
      );

      recordBacktestRequest('monte-carlo', 'sync', 'success');
      res.json(buildBacktestResponse(data, warnings, dateRange));
      logger.info(`[backtest] Monte Carlo completed in ${Date.now() - startTime}ms`);
    },
    {
      logMsg: 'Monte Carlo simulation error',
      code: 'MONTE_CARLO_ERROR',
      endpoint: 'monte-carlo',
    },
  ),
);

// ---------------------------------------------------------------------------
// 组合优化
// ---------------------------------------------------------------------------

router.post(
  '/optimize',
  validate(optimizeSchema),
  asyncRouteHandler(
    async (req, res) => {
      const startTime = Date.now();
      const { tickers, objective, constraints, parameters, numIterations } = req.body as {
        tickers: string[];
        objective: 'maxSharpe' | 'minVolatility' | 'maxReturn';
        constraints?: { minWeight?: number; maxWeight?: number };
        parameters: BacktestParameters;
        numIterations?: number;
      };

      const { data, warnings, dateRange } = await runOptimization(
        tickers,
        objective,
        constraints || {},
        parameters,
        numIterations,
      );

      logger.info(`[backtest] Optimization completed in ${Date.now() - startTime}ms`);
      recordBacktestRequest('optimize', 'sync', 'success');
      res.json(buildBacktestResponse(data, warnings, dateRange));
    },
    {
      logMsg: 'Optimization error',
      code: 'OPTIMIZATION_ERROR',
      endpoint: 'optimize',
    },
  ),
);

// ---------------------------------------------------------------------------
// 有效前沿
// ---------------------------------------------------------------------------

router.post(
  '/efficient-frontier',
  validate(efficientFrontierSchema),
  asyncRouteHandler(
    async (req, res) => {
      const { tickers, numPoints, parameters, riskFreeRate } = req.body as {
        tickers: string[];
        numPoints?: number;
        parameters: BacktestParameters;
        riskFreeRate?: number;
      };

      const { data, warnings, dateRange } = await runEfficientFrontier(
        tickers,
        parameters,
        numPoints,
        riskFreeRate,
      );

      recordBacktestRequest('efficient-frontier', 'sync', 'success');
      res.json(buildBacktestResponse(data, warnings, dateRange));
    },
    {
      logMsg: 'Efficient frontier error',
      code: 'EFFICIENT_FRONTIER_ERROR',
      endpoint: 'efficient-frontier',
    },
  ),
);

export default router;
