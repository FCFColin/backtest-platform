import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { validateQuery } from '../middleware/validate.js';
import { tickerListQuerySchema, tickerSearchQuerySchema } from '../schemas/dataManage.js';
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

/**
 * /stats 内存缓存：60s TTL，统计为全局数据故 key 不区分用户。
 * `?force=1` 穿透缓存强制刷新。避免外部缓存库依赖（ADR 一致：仅内存 Map/object）。
 */
const STATS_CACHE_TTL_MS = 60_000;
interface StatsCacheEntry {
  body: { success: true; data: unknown };
  expiresAt: number;
}
let cachedStats: StatsCacheEntry | null = null;

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
      title: 'Status Error',
      detail: 'Failed to get status',
    },
  ),
);

/** 详细统计（实时从 PostgreSQL 查询；60s 内存缓存，?force=1 穿透） */
router.get(
  '/stats',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      res.setHeader('Cache-Control', 'no-cache');

      if (!isForceRefresh(req) && cachedStats && cachedStats.expiresAt > Date.now()) {
        res.json(cachedStats.body);
        return;
      }

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

      cachedStats = { body, expiresAt: Date.now() + STATS_CACHE_TTL_MS };
      res.json(body);
      logger.info(`[dataManageRoutes] /stats 总耗时 ${Date.now() - t0}ms`);
    },
    {
      logMsg: '[dataManage] 获取统计失败',
      code: 'STATS_ERROR',
      title: 'Stats Error',
      detail: 'Failed to get stats',
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
      title: 'Ticker List Error',
      detail: 'Failed to get ticker list',
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
        sendProblem(res, 422, 'MISSING_PARAMS', 'Missing query parameter', {
          detail: 'Missing query parameter: q',
        });
        return;
      }
      const results = await searchTickers(query);
      res.json({ success: true, data: results });
    },
    {
      logMsg: '[dataManage] 搜索标的失败',
      code: 'SEARCH_ERROR',
      title: 'Search failed',
      detail: 'Failed to search',
    },
  ),
);

/** 更新状态查询 */
router.get('/update/status', (_req: Request, res: Response): void => {
  res.json({ success: true, data: getUpdateStatus() });
});

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
        title: 'Update Error',
        detail: '全量更新启动失败',
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
      title: 'Update Error',
      detail: '增量更新启动失败',
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
      title: 'Update Error',
      detail: '恢复更新启动失败',
    },
  ),
);

/** 停止当前运行的更新任务 */
router.post('/update/stop', requireDataManage, (_req: Request, res: Response): void => {
  const result = stopUpdate();
  res.json({ success: result.success, data: result });
});

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
      title: 'Universe Error',
      detail: '获取标的列表失败',
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
        sendProblem(res, 422, 'INVALID_TICKER', 'Invalid ticker format', {
          detail: 'ticker参数格式非法，仅允许大写字母、数字、点、下划线、连字符，长度1-20',
        });
        return;
      }
      const data = await loadTickerData(ticker);
      if (data) {
        res.json({ success: true, data });
      } else {
        sendProblem(res, 404, 'TICKER_NOT_FOUND', 'Ticker not found', {
          detail: `Ticker ${ticker} not found`,
        });
      }
    },
    {
      logMsg: '[dataManage] 加载标的数据失败',
      code: 'TICKER_LOAD_ERROR',
      title: 'Ticker load failed',
      detail: 'Failed to load ticker data',
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
