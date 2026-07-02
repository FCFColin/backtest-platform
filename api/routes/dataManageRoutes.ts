import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import {
  getEngineStatus,
  getTickerList,
  searchTickers,
  loadTickerData,
  scanMarketStatsFromDb,
  resolveUniverseFromCacheStats,
} from '../services/engineService.js';
import { isValidTicker } from '../utils/tickerValidation.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { startUpdate, stopUpdate, getUpdateStatus } from '../services/dataFetchService.js';

const router = Router();

const requireDataManage = requirePermission(Permission.DATA_MANAGE);

const SUNSET_DATE = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

function deprecationWarning(method: string, path: string): string {
  return `[DEPRECATED] 客户端调用了废弃端点 POST ${path}，请迁移到 ${method}。Sunset: ${SUNSET_DATE}`;
}

/** 引擎状态 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = await getEngineStatus();
    res.json({ success: true, data: status });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        type: 'https://backtest.platform/errors/status-error',
        title: 'Status Error',
        status: 500,
        code: 'STATUS_ERROR',
        detail: 'Failed to get status',
      },
    });
  }
});

/** 详细统计（实时从 PostgreSQL 查询） */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  const t0 = Date.now();
  try {
    const stats = await scanMarketStatsFromDb();

    if (!stats) {
      res.json({
        success: true,
        data: { stats: null, universe: { total: 0, updated_at: '', stats: {} } },
      });
      return;
    }

    const universe = resolveUniverseFromCacheStats(stats);
    res.json({ success: true, data: { stats, universe } });
    logger.info(`[dataManageRoutes] /stats 总耗时 ${Date.now() - t0}ms`);
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] 获取统计失败');
    res.status(500).json({
      success: false,
      error: {
        type: 'https://backtest.platform/errors/stats-error',
        title: 'Stats Error',
        status: 500,
        code: 'STATS_ERROR',
        detail: 'Failed to get stats',
      },
    });
  }
});

/** 标的列表（分页） */
router.get('/tickers', async (req: Request, res: Response): Promise<void> => {
  try {
    const tickers = await getTickerList();
    const total = tickers.length;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const MAX_LIMIT = 200;
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedData = tickers.slice(start, end);

    res.json({ success: true, data: paginatedData, pagination: { page, limit, total, totalPages } });
  } catch {
    res.status(500).json({
      success: false,
      error: {
        type: 'https://backtest.platform/errors/ticker-list-error',
        title: 'Ticker List Error',
        status: 500,
        code: 'TICKER_LIST_ERROR',
        detail: 'Failed to get ticker list',
      },
    });
  }
});

/** 搜索标的 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    if (!query) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing query parameter', {
        detail: 'Missing query parameter: q',
      });
      return;
    }
    const results = await searchTickers(query);
    res.json({ success: true, data: results });
  } catch {
    sendProblem(res, 500, 'SEARCH_ERROR', 'Search failed', {
      detail: 'Failed to search',
    });
  }
});

/** 更新状态查询 */
router.get('/update/status', (_req: Request, res: Response): void => {
  res.json({ success: true, data: getUpdateStatus() });
});

/** 全量更新：获取所有标的所有数据 */
router.put('/update/full', requireDataManage, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await startUpdate('full');
    res.json({ success: result.success, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] 全量更新失败');
    res.status(500).json({
      success: false,
      error: {
        type: 'https://backtest.platform/errors/update-error',
        title: 'Update Error',
        status: 500,
        code: 'UPDATE_ERROR',
        detail: '全量更新启动失败',
      },
    });
  }
});

/** 增量更新：仅获取新增日期的数据 */
router.patch('/update/inc', requireDataManage, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await startUpdate('incremental');
    res.json({ success: result.success, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] 增量更新失败');
    res.status(500).json({
      success: false,
      error: {
        type: 'https://backtest.platform/errors/update-error',
        title: 'Update Error',
        status: 500,
        code: 'UPDATE_ERROR',
        detail: '增量更新启动失败',
      },
    });
  }
});

/** 重新拉取：等价于全量更新 */
router.put('/update/refetch', requireDataManage, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await startUpdate('full');
    res.json({ success: result.success, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] 重新拉取失败');
    res.status(500).json({
      success: false,
      error: {
        type: 'https://backtest.platform/errors/update-error',
        title: 'Update Error',
        status: 500,
        code: 'UPDATE_ERROR',
        detail: '重新拉取启动失败',
      },
    });
  }
});

/** 暂停后继续：等价于增量更新 */
router.patch('/resume', requireDataManage, async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await startUpdate('incremental');
    res.json({ success: result.success, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] 恢复更新失败');
    res.status(500).json({
      success: false,
      error: {
        type: 'https://backtest.platform/errors/update-error',
        title: 'Update Error',
        status: 500,
        code: 'UPDATE_ERROR',
        detail: '恢复更新启动失败',
      },
    });
  }
});

/** 停止当前运行的更新任务 */
router.post('/update/stop', requireDataManage, (_req: Request, res: Response): void => {
  const result = stopUpdate();
  res.json({ success: result.success, data: result });
});

/** 刷新标的列表：数据已在 PostgreSQL 中，直接返回成功 */
router.put('/universe', requireDataManage, async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await scanMarketStatsFromDb();
    res.json({
      success: true,
      data: {
        message: '标的列表已在 PostgreSQL 中实时可用，无需刷新',
        total: stats?.total_cached ?? 0,
      },
    });
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] 刷新标的列表失败');
    res.status(500).json({
      success: false,
      error: {
        type: 'https://backtest.platform/errors/universe-error',
        title: 'Universe Error',
        status: 500,
        code: 'UNIVERSE_ERROR',
        detail: '获取标的列表失败',
      },
    });
  }
});

/** 获取单个标的数据 */
router.get('/ticker/:id', async (req: Request, res: Response): Promise<void> => {
  try {
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
  } catch {
    sendProblem(res, 500, 'TICKER_LOAD_ERROR', 'Ticker load failed', {
      detail: 'Failed to load ticker data',
    });
  }
});

/** 重新生成元信息：数据来自 PostgreSQL，无需操作 */
router.put('/regenerate-meta', requireDataManage, (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      message: '元信息已由 PostgreSQL 实时计算，无需重新生成。',
    },
  });
});

// Post endpoints — 兼容旧版客户端，内部转发到相同逻辑
function setDeprecationHeaders(res: Response, method: string, path: string): void {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', `<${path}>; rel="successor-version"`);
}

router.post('/update/full', requireDataManage, async (req: Request, res: Response): Promise<void> => {
  logger.warn(deprecationWarning('PUT /api/v1/data/manage/update/full', req.path));
  setDeprecationHeaders(res, 'PUT', '/api/v1/data/manage/update/full');
  try {
    const result = await startUpdate('full');
    res.json({ success: result.success, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] POST /update/full 失败');
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/update-error', title: 'Update Error', status: 500, code: 'UPDATE_ERROR', detail: '全量更新启动失败' } });
  }
});
router.post('/update/inc', requireDataManage, async (req: Request, res: Response): Promise<void> => {
  logger.warn(deprecationWarning('PATCH /api/v1/data/manage/update/inc', req.path));
  setDeprecationHeaders(res, 'PATCH', '/api/v1/data/manage/update/inc');
  try {
    const result = await startUpdate('incremental');
    res.json({ success: result.success, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] POST /update/inc 失败');
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/update-error', title: 'Update Error', status: 500, code: 'UPDATE_ERROR', detail: '增量更新启动失败' } });
  }
});
router.post('/update/refetch', requireDataManage, async (req: Request, res: Response): Promise<void> => {
  logger.warn(deprecationWarning('PUT /api/v1/data/manage/update/refetch', req.path));
  setDeprecationHeaders(res, 'PUT', '/api/v1/data/manage/update/refetch');
  try {
    const result = await startUpdate('full');
    res.json({ success: result.success, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] POST /update/refetch 失败');
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/update-error', title: 'Update Error', status: 500, code: 'UPDATE_ERROR', detail: '重新拉取启动失败' } });
  }
});
router.post('/resume', requireDataManage, async (req: Request, res: Response): Promise<void> => {
  logger.warn(deprecationWarning('PATCH /api/v1/data/manage/resume', req.path));
  setDeprecationHeaders(res, 'PATCH', '/api/v1/data/manage/resume');
  try {
    const result = await startUpdate('incremental');
    res.json({ success: result.success, data: result });
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] POST /resume 失败');
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/update-error', title: 'Update Error', status: 500, code: 'UPDATE_ERROR', detail: '恢复更新启动失败' } });
  }
});
router.post('/universe', requireDataManage, async (req: Request, res: Response): Promise<void> => {
  logger.warn(deprecationWarning('PUT /api/v1/data/manage/universe', req.path));
  setDeprecationHeaders(res, 'PUT', '/api/v1/data/manage/universe');
  try {
    const stats = await scanMarketStatsFromDb();
    res.json({ success: true, data: { message: '标的列表已实时可用', total: stats?.total_cached ?? 0 } });
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] POST /universe 失败');
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/universe-error', title: 'Universe Error', status: 500, code: 'UNIVERSE_ERROR', detail: '获取标的列表失败' } });
  }
});
router.post('/regenerate-meta', requireDataManage, (req: Request, res: Response): void => {
  logger.warn(deprecationWarning('PUT /api/v1/data/manage/regenerate-meta', req.path));
  setDeprecationHeaders(res, 'PUT', '/api/v1/data/manage/regenerate-meta');
  res.json({ success: true, data: { message: '元信息由 PostgreSQL 实时计算，无需重新生成。' } });
});

export default router;
