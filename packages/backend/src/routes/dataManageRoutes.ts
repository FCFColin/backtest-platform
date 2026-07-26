import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { validateQuery } from '../middleware/validate.js';
import { tickerListQuerySchema, tickerSearchQuerySchema } from '../schemas/data.js';
import {
  getEngineStatus,
  getTickerList,
  loadTickerData,
  resolveUniverseFromCacheStats,
} from '../infrastructure/tickerDataService.js';
import { searchTickers } from '../infrastructure/dataFacade.js';
import { scanMarketStatsFromDb } from '../db/marketStats.js';
import { isValidTicker } from '../utils/tickerValidation.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { startUpdate, stopUpdate, getUpdateStatus } from '../infrastructure/dataFetch.js';
import { crudRouteHandler } from './routeUtils.js';

const router = Router();

const requireDataManage = requirePermission(Permission.DATA_MANAGE);

function isForceRefresh(req: Request): boolean {
  const v = req.query.force;
  return v === '1' || v === 'true';
}

/** 引擎状态 */
router.get(
  '/status',
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const status = await getEngineStatus();
      res.json({ success: true, data: status });
    },
    {
      logMsg: '[dataManage] 获取引擎状态失败',
      code: 'STATUS_ERROR',
    },
  ),
);

/** 详细统计（实时从 PostgreSQL 查询；P1-2 移除内存 cachedStats，每次直查 PG） */
router.get(
  '/stats',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      res.setHeader('Cache-Control', 'no-cache');
      void isForceRefresh(req); // force 参数保留接口兼容，但不再需要内存缓存穿透

      const t0 = Date.now();
      const stats = await scanMarketStatsFromDb();

      let body: { success: true; data: unknown };
      if (!stats) {
        body = {
          success: true,
          data: { stats: null, universe: { total: 0, updated_at: '', stats: {} } },
        };
      } else {
        const universe = resolveUniverseFromCacheStats(stats);
        body = { success: true, data: { stats, universe } };
      }

      res.json(body);
      logger.info(`[dataManageRoutes] /stats 总耗时 ${Date.now() - t0}ms`);
    },
    {
      logMsg: '[dataManage] 获取统计失败',
      code: 'STATS_ERROR',
    },
  ),
);

/** 标的列表（分页） */
router.get(
  '/tickers',
  validateQuery(tickerListQuerySchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tickers = await getTickerList();
      const total = tickers.length;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const MAX_LIMIT = 200;
      const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      const end = start + limit;
      const paginatedData = tickers.slice(start, end);

      res.json({
        success: true,
        data: paginatedData,
        pagination: { page, limit, total, totalPages },
      });
    },
    {
      logMsg: '[dataManage] 获取标的列表失败',
      code: 'TICKER_LIST_ERROR',
    },
  ),
);

/** 搜索标的 */
router.get(
  '/search',
  validateQuery(tickerSearchQuerySchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const query = req.query.q as string;
      if (!query) {
        sendProblem(res, 422, 'MISSING_PARAMS');
        return;
      }
      const results = await searchTickers(query);
      res.json({ success: true, data: results });
    },
    {
      logMsg: '[dataManage] 搜索标的失败',
      code: 'SEARCH_ERROR',
    },
  ),
);

/** 更新状态查询 */
router.get(
  '/update/status',
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const status = await getUpdateStatus();
      res.json({ success: true, data: status });
    },
    {
      logMsg: '[dataManage] 获取更新状态失败',
      code: 'UPDATE_STATUS_ERROR',
    },
  ),
);

/** 全量更新/重新拉取：获取所有标的所有数据 */
for (const path of ['/update/full', '/update/refetch'] as const) {
  router.put(
    path,
    requireDataManage,
    crudRouteHandler(
      async (_req: Request, res: Response): Promise<void> => {
        const result = await startUpdate('full');
        res.json({ success: result.success, data: result });
      },
      {
        logMsg: `[dataManage] ${path} 失败`,
        code: 'UPDATE_ERROR',
      },
    ),
  );
}

/** 增量更新：仅获取新增日期的数据 */
router.patch(
  '/update/inc',
  requireDataManage,
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const result = await startUpdate('incremental');
      res.json({ success: result.success, data: result });
    },
    {
      logMsg: '[dataManage] 增量更新失败',
      code: 'UPDATE_ERROR',
    },
  ),
);

/** 暂停后继续：等价于增量更新 */
router.patch(
  '/resume',
  requireDataManage,
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const result = await startUpdate('incremental');
      res.json({ success: result.success, data: result });
    },
    {
      logMsg: '[dataManage] 恢复更新失败',
      code: 'UPDATE_ERROR',
    },
  ),
);

/** 停止当前运行的更新任务 */
router.post(
  '/update/stop',
  requireDataManage,
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const result = await stopUpdate();
      res.json({ success: result.success, data: result });
    },
    {
      logMsg: '[dataManage] 停止更新失败',
      code: 'UPDATE_STOP_ERROR',
    },
  ),
);

/** 刷新标的列表：数据已在 PostgreSQL 中，直接返回成功 */
router.put(
  '/universe',
  requireDataManage,
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const stats = await scanMarketStatsFromDb();
      res.json({
        success: true,
        data: {
          message: '标的列表已在 PostgreSQL 中实时可用，无需刷新',
          total: stats?.total_cached ?? 0,
        },
      });
    },
    {
      logMsg: '[dataManage] 刷新标的列表失败',
      code: 'UNIVERSE_ERROR',
    },
  ),
);

/** 获取单个标的数据 */
router.get(
  '/ticker/:id',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ticker = req.params.id;
      if (!isValidTicker(ticker)) {
        sendProblem(res, 422, 'INVALID_TICKER');
        return;
      }
      const data = await loadTickerData(ticker);
      if (data) {
        res.json({ success: true, data });
      } else {
        sendProblem(res, 404, 'TICKER_NOT_FOUND');
      }
    },
    {
      logMsg: '[dataManage] 加载标的数据失败',
      code: 'TICKER_LOAD_ERROR',
    },
  ),
);

/** 重新生成元信息：数据来自 PostgreSQL，无需操作 */
router.put('/regenerate-meta', requireDataManage, (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      message: '元信息已由 PostgreSQL 实时计算，无需重新生成。',
    },
  });
});

export default router;
