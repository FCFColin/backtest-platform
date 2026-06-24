/**
 * 数据引擎管理路由 v2
 * GET    /api/v1/data/manage/status          - 引擎状态
 * GET    /api/v1/data/manage/stats           - 详细统计（时间范围、数据量、质量）
 * GET    /api/v1/data/manage/tickers         - 标的列表
 * GET    /api/v1/data/manage/search          - 搜索标的
 * PUT    /api/v1/data/manage/update/full     - 全量更新（幂等：重复调用结果一致）
 * PATCH  /api/v1/data/manage/update/inc      - 增量更新（仅补充缺失数据）
 * PUT    /api/v1/data/manage/update/refetch  - 重新获取已有标的完整历史（完整替换）
 * PATCH  /api/v1/data/manage/resume          - 恢复中断（部分修改任务状态）
 * PUT    /api/v1/data/manage/universe        - 刷新宇宙（完整替换宇宙列表）
 * GET    /api/v1/data/manage/ticker/:id      - 获取标的数据
 * PUT    /api/v1/data/manage/regenerate-meta - 重新生成元数据文件（完整替换）
 *
 * 企业理由（HTTP 方法语义）：
 * - PUT 用于完整替换资源，语义为"用请求体替换目标资源的全部表示"（RFC 9110 §9.6.3），
 *   天然幂等，客户端可安全重试，中间代理可缓存 PUT 响应。
 * - PATCH 用于部分更新资源，语义为"对资源应用部分修改"（RFC 5789），
 *   适合增量/状态变更场景，避免客户端必须发送完整表示。
 * - 正确的 HTTP 方法选择影响：缓存策略（PUT 响应可缓存，POST 不可）、
 *   幂等性保证（PUT 天然幂等，客户端可安全重试）、RESTful 语义一致性
 *   （工具链/网关/负载均衡器根据方法做路由和限流决策）。
 * - 旧 POST 路由保留为 deprecated，通过 RFC 8594 Deprecation + Sunset 头
 *   引导客户端迁移，6 个月过渡期后移除。
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import {
  getEngineStatus,
  triggerFullUpdate,
  triggerIncrementalUpdate,
  triggerRefetch,
  triggerResume,
  triggerUniverseRefresh,
  getTickerList,
  searchTickers,
  loadTickerData,
  scanTickersStats,
  scanTickersStatsAsync,
  generateMetaFiles,
  getUniverseStats,
} from '../services/engineService.js';
import { isValidTicker } from '../utils/tickerValidation.js';

const router = Router();

/** 废弃端点过渡期截止日期（6 个月后），符合 RFC 8594 Sunset 头规范 */
const SUNSET_DATE = new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

/**
 * 为废弃的 POST 路由添加 Deprecation + Sunset + Link 响应头，并记录警告日志。
 *
 * 企业理由：RFC 8594 定义了 Deprecation 和 Sunset HTTP 头字段，
 * 使 API 消费方能程序化检测端点废弃状态并规划迁移。
 * 日志警告帮助运维团队追踪哪些客户端仍在使用废弃端点，
 * 以便在 Sunset 日期前主动通知。
 */
function deprecationHeaders(req: Request, res: Response, newMethod: string, newPath: string): void {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', SUNSET_DATE);
  res.setHeader('Link', `<${newPath}>; rel="successor-version"`);
  logger.warn(
    `[DEPRECATED] 客户端调用了废弃端点 POST ${req.path}，请迁移到 ${newMethod} ${newPath}。Sunset: ${SUNSET_DATE}`
  );
}

/** 引擎状态 */
router.get('/status', (_req: Request, res: Response): void => {
  try {
    const status = getEngineStatus();
    res.json({ success: true, data: status });
  } catch (_error) {
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/status-error', title: 'Status Error', status: 500, code: 'STATUS_ERROR', detail: 'Failed to get status' } });
  }
});

let statsScanning = false;
let statsScanningSince: number | null = null;
let statsScanError: string | null = null;
const STATS_SCANNING_TIMEOUT_MS = 120_000; // 120 秒

/** 详细统计（优先缓存，无缓存时后台扫描） */
router.get('/stats', (_req: Request, res: Response): void => {
  const t0 = Date.now();
  try {
    // 超时自动重置：避免因异常或卡死导致标志永久卡在 true
    if (statsScanning && statsScanningSince && (Date.now() - statsScanningSince > STATS_SCANNING_TIMEOUT_MS)) {
      logger.warn('[dataManageRoutes] statsScanning 超时未完成，自动重置');
      statsScanning = false;
      statsScanningSince = null;
      statsScanError = '扫描超时，请重试';
    }

    const scanT0 = Date.now();
    const stats = scanTickersStats();
    logger.info(`[dataManageRoutes] /stats scanTickersStats 耗时 ${Date.now() - scanT0}ms`);
    if (stats) {
      statsScanError = null;
      const universe = getUniverseStats();
      res.json({ success: true, data: { stats, universe } });
    } else if (statsScanning) {
      res.json({ success: true, data: { stats: null, universe: getUniverseStats(), scanning: true } });
    } else if (statsScanError) {
      // 上次扫描失败，返回错误信息让前端能区分
      const err = statsScanError;
      statsScanError = null; // 下次请求重新触发扫描
      res.json({ success: false, error: err, errorType: 'scan_failed' });
    } else {
      // 触发后台扫描
      statsScanning = true;
      statsScanningSince = Date.now();
      statsScanError = null;
      setImmediate(async () => {
        try {
          const result = await scanTickersStatsAsync(true);
          if (!result) {
            statsScanError = '扫描未产生结果，数据目录可能为空';
          }
        } catch (err) {
          logger.error({ err }, '[dataManageRoutes] 扫描失败');
          statsScanError = `扫描失败: ${(err as Error).message}`;
        } finally {
          statsScanning = false;
          statsScanningSince = null;
        }
      });
      res.json({ success: true, data: { stats: null, universe: getUniverseStats(), scanning: true } });
    }
    logger.info(`[dataManageRoutes] /stats 总耗时 ${Date.now() - t0}ms`);
  } catch (error) {
    logger.error({ err: error as Error }, '[dataManage] 获取统计失败');
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/stats-error', title: 'Stats Error', status: 500, code: 'STATS_ERROR', detail: 'Failed to get stats' } });
  }
});

/** 标的列表（分页）
 *
 * 企业理由：标的列表可能包含数百甚至上千条记录，一次性返回全部数据
 * 会导致响应体积过大、前端渲染卡顿、网络传输慢。分页是 REST API 的
 * 标准实践，客户端按需加载，减少单次请求开销。
 *
 * 权衡：使用内存数组切片实现分页（而非数据库 OFFSET/LIMIT），
 * 因为当前数据源是 Go 服务返回的全量列表，数据量不大（< 10K 条），
 * 内存切片足够高效。若数据量增长到十万级，需改为服务端分页
 * （Go 服务支持 limit/offset 参数），避免全量加载后丢弃。
 */
router.get('/tickers', async (req: Request, res: Response): Promise<void> => {
  try {
    const tickers = await getTickerList();
    const total = tickers.length;

    // 解析分页参数，限制上限防止客户端请求过多数据
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const MAX_LIMIT = 200;
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const totalPages = Math.ceil(total / limit);

    // 数组切片实现内存分页
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedData = tickers.slice(start, end);

    res.json({
      success: true,
      data: paginatedData,
      pagination: { page, limit, total, totalPages },
    });
  } catch (_error) {
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/ticker-list-error', title: 'Ticker List Error', status: 500, code: 'TICKER_LIST_ERROR', detail: 'Failed to get ticker list' } });
  }
});

/** 搜索标的 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    if (!query) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing query parameter', 'Missing query parameter: q');
      return;
    }
    const results = await searchTickers(query);
    res.json({ success: true, data: results });
  } catch (_error) {
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/search-error', title: 'Search Error', status: 500, code: 'SEARCH_ERROR', detail: 'Failed to search' } });
  }
});

/**
 * PUT /update/full - 全量更新
 *
 * 企业理由：全量更新语义为"替换所有数据"，符合 PUT 的完整替换语义（RFC 9110 §9.6.3）。
 * PUT 天然幂等——重复调用不会产生不同结果（引擎已运行则跳过或重启，最终状态一致），
 * 客户端可安全重试（网络超时、负载均衡重试等场景），中间代理可缓存 PUT 响应。
 * 相比之下，POST 不保证幂等性，重试可能触发多次全量更新。
 */
router.put('/update/full', (_req: Request, res: Response): void => {
  try {
    const result = triggerFullUpdate();
    res.status(202).json({ success: true, data: result });
  } catch (_error) {
    sendProblem(res, 500, 'FULL_UPDATE_ERROR', 'Full update failed', 'Failed to trigger full update');
  }
});

/**
 * PATCH /update/inc - 增量更新
 *
 * 企业理由：增量更新语义为"仅补充缺失数据"，是对现有数据集的部分修改，
 * 符合 PATCH 的部分更新语义（RFC 5789）。与 PUT（完整替换）不同，
 * PATCH 只影响缺失部分，不会重新获取已有数据。幂等性取决于实现：
 * 当前实现中重复调用不会重复获取已有数据，因此实际幂等。
 */
router.patch('/update/inc', (_req: Request, res: Response): void => {
  try {
    const result = triggerIncrementalUpdate();
    res.status(202).json({ success: true, data: result });
  } catch (_error) {
    sendProblem(res, 500, 'INC_UPDATE_ERROR', 'Incremental update failed', 'Failed to trigger incremental update');
  }
});

/**
 * PUT /update/refetch - 重新获取已有标的完整历史
 *
 * 企业理由：refetch 语义为"完整替换已有标的的历史数据"，
 * 符合 PUT 的完整替换语义。幂等——重复调用最终产生相同数据状态。
 */
router.put('/update/refetch', (_req: Request, res: Response): void => {
  try {
    const result = triggerRefetch();
    res.status(202).json({ success: true, data: result });
  } catch (_error) {
    sendProblem(res, 500, 'REFETCH_ERROR', 'Refetch failed', 'Failed to trigger refetch');
  }
});

/**
 * PATCH /resume - 恢复中断
 *
 * 企业理由：resume 语义为"将中断的任务状态从暂停修改为运行"，
 * 是对任务状态的部分修改，符合 PATCH 语义。不是完整替换任务，
 * 而是修改其 state 字段。
 */
router.patch('/resume', (_req: Request, res: Response): void => {
  try {
    const result = triggerResume();
    res.status(202).json({ success: true, data: result });
  } catch (_error) {
    sendProblem(res, 500, 'RESUME_ERROR', 'Resume failed', 'Failed to resume');
  }
});

/**
 * PUT /universe - 刷新宇宙
 *
 * 企业理由：universe refresh 语义为"完整替换投资宇宙列表"，
 * 符合 PUT 的完整替换语义。幂等——重复刷新产生相同的宇宙集合。
 */
router.put('/universe', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await triggerUniverseRefresh();
    res.status(202).json({ success: true, data: result });
  } catch (_error) {
    sendProblem(res, 500, 'UNIVERSE_ERROR', 'Universe refresh failed', 'Failed to refresh universe');
  }
});

/** 获取单个标的数据 */
router.get('/ticker/:id', (req: Request, res: Response): void => {
  try {
    const ticker = req.params.id;
    // 校验 :id 参数格式，防止路径遍历
    if (!isValidTicker(ticker)) {
      sendProblem(res, 422, 'INVALID_TICKER', 'Invalid ticker format', 'ticker参数格式非法，仅允许大写字母、数字、点、下划线、连字符，长度1-20');
      return;
    }
    const data = loadTickerData(ticker);
    if (data) {
      res.json({ success: true, data });
    } else {
      sendProblem(res, 404, 'TICKER_NOT_FOUND', 'Ticker not found', `Ticker ${ticker} not found`);
    }
  } catch (_error) {
    sendProblem(res, 500, 'TICKER_LOAD_ERROR', 'Ticker load failed', 'Failed to load ticker data');
  }
});

/**
 * PUT /regenerate-meta - 重新生成元数据文件
 *
 * 企业理由：regenerate-meta 语义为"完整替换所有元数据文件"，
 * 符合 PUT 的完整替换语义。幂等——重复生成产生相同的元数据文件。
 */
router.put('/regenerate-meta', async (_req: Request, res: Response): Promise<void> => {
  try {
    await generateMetaFiles();
    res.json({ success: true, message: '元数据文件已重新生成' });
  } catch (_err) {
    sendProblem(res, 500, 'META_REGEN_ERROR', 'Meta regeneration failed', '元数据生成失败');
  }
});

// ============================================================
// 废弃端点（POST → PUT/PATCH 迁移过渡期）
//
// 企业理由：保持向后兼容，旧客户端仍可使用 POST 方法。
// 通过 RFC 8594 Deprecation + Sunset 头引导客户端迁移。
// 过渡期 6 个月后移除这些路由。
// ============================================================

/** @deprecated 使用 PUT /update/full 替代。Sunset 后将移除此端点。 */
router.post('/update/full', (req: Request, res: Response): void => {
  deprecationHeaders(req, res, 'PUT', '/api/v1/data/manage/update/full');
  try {
    const result = triggerFullUpdate();
    res.status(202).json({ success: true, data: result });
  } catch (_error) {
    sendProblem(res, 500, 'FULL_UPDATE_ERROR', 'Full update failed', 'Failed to trigger full update');
  }
});

/** @deprecated 使用 PATCH /update/inc 替代。Sunset 后将移除此端点。 */
router.post('/update/inc', (req: Request, res: Response): void => {
  deprecationHeaders(req, res, 'PATCH', '/api/v1/data/manage/update/inc');
  try {
    const result = triggerIncrementalUpdate();
    res.status(202).json({ success: true, data: result });
  } catch (_error) {
    sendProblem(res, 500, 'INC_UPDATE_ERROR', 'Incremental update failed', 'Failed to trigger incremental update');
  }
});

/** @deprecated 使用 PUT /update/refetch 替代。Sunset 后将移除此端点。 */
router.post('/update/refetch', (req: Request, res: Response): void => {
  deprecationHeaders(req, res, 'PUT', '/api/v1/data/manage/update/refetch');
  try {
    const result = triggerRefetch();
    res.status(202).json({ success: true, data: result });
  } catch (_error) {
    sendProblem(res, 500, 'REFETCH_ERROR', 'Refetch failed', 'Failed to trigger refetch');
  }
});

/** @deprecated 使用 PATCH /resume 替代。Sunset 后将移除此端点。 */
router.post('/resume', (req: Request, res: Response): void => {
  deprecationHeaders(req, res, 'PATCH', '/api/v1/data/manage/resume');
  try {
    const result = triggerResume();
    res.status(202).json({ success: true, data: result });
  } catch (_error) {
    sendProblem(res, 500, 'RESUME_ERROR', 'Resume failed', 'Failed to resume');
  }
});

/** @deprecated 使用 PUT /universe 替代。Sunset 后将移除此端点。 */
router.post('/universe', async (req: Request, res: Response): Promise<void> => {
  deprecationHeaders(req, res, 'PUT', '/api/v1/data/manage/universe');
  try {
    const result = await triggerUniverseRefresh();
    res.status(202).json({ success: true, data: result });
  } catch (_error) {
    sendProblem(res, 500, 'UNIVERSE_ERROR', 'Universe refresh failed', 'Failed to refresh universe');
  }
});

/** @deprecated 使用 PUT /regenerate-meta 替代。Sunset 后将移除此端点。 */
router.post('/regenerate-meta', async (req: Request, res: Response): Promise<void> => {
  deprecationHeaders(req, res, 'PUT', '/api/v1/data/manage/regenerate-meta');
  try {
    await generateMetaFiles();
    res.json({ success: true, message: '元数据文件已重新生成' });
  } catch (_err) {
    sendProblem(res, 500, 'META_REGEN_ERROR', 'Meta regeneration failed', '元数据生成失败');
  }
});

export default router;
