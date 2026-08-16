import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { validateQuery, validate } from '../middleware/miscMiddleware.js';
import { tickerListQuerySchema, tickerSearchQuerySchema } from '../schemas/analysisSchemas.js';
import {
  getEngineStatus,
  getTickerList,
  loadTickerData,
  resolveUniverseFromCacheStats,
} from '../infrastructure/dataQuery.js';
import { searchTickers } from '../infrastructure/dataFacade.js';
import { scanMarketStatsFromDb, getLastUpdated } from '../db/marketStats.js';
import { isValidTicker } from '../utils/tickerValidation.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { startUpdate, stopUpdate, getUpdateStatus } from '../infrastructure/dataServices.js';
import { emptyBodySchema } from '../schemas/analysisSchemas.js';
import { crudRouteHandler, jsonRoute, sendData } from './routeUtils.js';

const router = Router();
const requireDataManage = requirePermission(Permission.DATA_MANAGE);

function isForceRefresh(req: Request): boolean {
  const v = req.query.force;
  return v === '1' || v === 'true';
}
const UPDATE_LOG: Record<string, string> = {
  full: '全量更新',
  incremental: '增量更新',
  stop: '停止更新',
};
function updateRoute(mode: 'full' | 'incremental' | 'stop', code: string) {
  return crudRouteHandler(
    async (_req, res): Promise<void> => {
      const result = mode === 'stop' ? await stopUpdate() : await startUpdate(mode);
      // 失败时 error 承载 message，成功时 data 含 message/jobId（前端按 json.success 分支渲染）
      res.json(
        result.success
          ? { success: true, data: result }
          : { success: false, error: result.message },
      );
    },
    { logMsg: `[dataManage] ${UPDATE_LOG[mode]}失败`, code },
  );
}

router.get(
  '/status',
  jsonRoute('[dataManage] 获取引擎状态失败', 'STATUS_ERROR', async () => getEngineStatus()),
);

router.get(
  '/last-updated',
  jsonRoute('[dataManage] 获取最后更新日期失败', 'LAST_UPDATED_ERROR', async () => ({
    lastUpdated: await getLastUpdated(),
  })),
);

router.get(
  '/stats',
  crudRouteHandler(
    async (req, res): Promise<void> => {
      res.setHeader('Cache-Control', 'no-cache');
      const t0 = Date.now();
      // 匿名（guest）不可触发强制重扫，防未认证流量打满 DB 扫描
      const stats = await scanMarketStatsFromDb(isForceRefresh(req) && req.user?.sub !== 'guest');
      const body = stats
        ? { success: true, data: { stats, universe: resolveUniverseFromCacheStats(stats) } }
        : {
            success: true,
            data: { stats: null, universe: { total: 0, updated_at: '', stats: {} } },
          };
      res.json(body);
      logger.info(`[dataManageRoutes] /stats 总耗时 ${Date.now() - t0}ms`);
    },
    { logMsg: '[dataManage] 获取统计失败', code: 'STATS_ERROR' },
  ),
);

router.get(
  '/tickers',
  validateQuery(tickerListQuerySchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tickers = await getTickerList();
      const total = tickers.length;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
      const totalPages = Math.ceil(total / limit);
      const start = (page - 1) * limit;
      res.json({
        success: true,
        data: tickers.slice(start, start + limit),
        pagination: { page, limit, total, totalPages },
      });
    },
    { logMsg: '[dataManage] 获取标的列表失败', code: 'TICKER_LIST_ERROR' },
  ),
);

router.get(
  '/search',
  validateQuery(tickerSearchQuerySchema),
  crudRouteHandler(
    async (req, res): Promise<void> => {
      const query = req.query.q as string;
      if (!query) {
        sendProblem(res, 422, 'MISSING_PARAMS');
        return;
      }
      sendData(res, await searchTickers(query, undefined, req.tenantId));
    },
    { logMsg: '[dataManage] 搜索标的失败', code: 'SEARCH_ERROR' },
  ),
);

router.get(
  '/update/status',
  jsonRoute('[dataManage] 获取更新状态失败', 'UPDATE_STATUS_ERROR', async () => getUpdateStatus()),
);

router.put(
  '/update/full',
  requireDataManage,
  validate(emptyBodySchema),
  updateRoute('full', 'UPDATE_ERROR'),
);
router.patch(
  '/update/inc',
  requireDataManage,
  validate(emptyBodySchema),
  updateRoute('incremental', 'UPDATE_ERROR'),
);
router.post(
  '/update/stop',
  requireDataManage,
  validate(emptyBodySchema),
  updateRoute('stop', 'UPDATE_STOP_ERROR'),
);

router.put(
  '/universe',
  requireDataManage,
  validate(emptyBodySchema),
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const stats = await scanMarketStatsFromDb();
      sendData(res, {
        message: '标的列表已在 PostgreSQL 中实时可用，无需刷新',
        total: stats?.total_cached ?? 0,
      });
    },
    { logMsg: '[dataManage] 刷新标的列表失败', code: 'UNIVERSE_ERROR' },
  ),
);

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
      if (data) sendData(res, data);
      else sendProblem(res, 404, 'TICKER_NOT_FOUND');
    },
    { logMsg: '[dataManage] 加载标的数据失败', code: 'TICKER_LOAD_ERROR' },
  ),
);

export default router;
