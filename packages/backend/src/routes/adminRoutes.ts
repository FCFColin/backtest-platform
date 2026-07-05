/**
 * 管理后台路由
 * GET /api/admin/stats  - 仪表盘统计数据
 * GET /api/admin/system - 系统资源信息
 */

import { Router, type Request, type Response } from 'express';
import { callService } from '../utils/httpClient.js';
import { scanTickersStats, getUniverseStats } from '../services/engineService.js';
import type { DbMarketStats } from '../db/marketStats.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { listRuns, type BacktestRunRecord } from '../services/backtestRunRepo.js';

const router = Router();

/** 默认空 ticker 统计兼底 */
function defaultTickerStats(): DbMarketStats {
  return {
    total_cached: 0,
    by_market: {},
    by_type: {},
    by_exchange: {},
    date_ranges: { earliest: null, latest: null },
    by_decade: {},
    by_year_count: {},
    coverage: {
      tickers_with_5y_plus: 0,
      tickers_with_10y_plus: 0,
      tickers_with_20y_plus: 0,
      avg_data_points: 0,
      median_data_points: 0,
    },
    data_quality: {
      with_adj_close: 0,
      with_dividends: 0,
      with_splits: 0,
      total_data_points: 0,
      total_size_mb: 0,
    },
    recent_updates: [],
    sample_tickers: {},
    generated_at: '',
  };
}

/** 构建仪表盘响应数据 */
function buildStatsResponseData(args: {
  engineHealth: Awaited<ReturnType<typeof checkServiceHealth>>;
  goHealth: Awaited<ReturnType<typeof checkServiceHealth>>;
  tickerStats: ReturnType<typeof defaultTickerStats>;
  universeStats: Awaited<ReturnType<typeof getUniverseStats>>;
  backtestHistory: BacktestRunRecord[];
}) {
  const { engineHealth, goHealth, tickerStats, universeStats, backtestHistory } = args;
  const memUsage = process.memoryUsage();
  const uptimeSeconds = process.uptime();
  return {
    services: { go_engine: engineHealth, go_data_service: goHealth },
    data_stats: {
      total_tickers: tickerStats.total_cached,
      total_size_mb: tickerStats.data_quality.total_size_mb,
      total_data_points: tickerStats.data_quality.total_data_points,
      date_range: {
        earliest: tickerStats.date_ranges.earliest,
        latest: tickerStats.date_ranges.latest,
      },
      universe_total: universeStats.total,
      universe_updated_at: universeStats.updated_at,
      by_market: tickerStats.by_market,
      by_type: tickerStats.by_type,
      coverage: tickerStats.coverage,
      data_quality: {
        with_adj_close: tickerStats.data_quality.with_adj_close,
        with_dividends: tickerStats.data_quality.with_dividends,
        with_splits: tickerStats.data_quality.with_splits,
      },
    },
    system: {
      memory: {
        rss_mb: Math.round((memUsage.rss / 1024 / 1024) * 10) / 10,
        heap_used_mb: Math.round((memUsage.heapUsed / 1024 / 1024) * 10) / 10,
        heap_total_mb: Math.round((memUsage.heapTotal / 1024 / 1024) * 10) / 10,
        external_mb: Math.round((memUsage.external / 1024 / 1024) * 10) / 10,
      },
      uptime_seconds: Math.round(uptimeSeconds),
      uptime_formatted: formatUptime(uptimeSeconds),
    },
    backtest_history: backtestHistory,
  };
}

/** 检查服务健康状态，失败时返回降级数据 */
async function checkServiceHealth(
  baseUrl: string,
  endpoint: string,
  serviceName: string,
): Promise<{
  status: 'healthy' | 'unhealthy';
  latency_ms: number;
  version?: string;
  error?: string;
}> {
  const start = Date.now();
  try {
    const result = (await callService(baseUrl, endpoint, undefined, 5000)) as {
      status?: string;
      success?: boolean;
      version?: string;
    } | null;
    const latency = Date.now() - start;
    if (result && (result.status === 'ok' || result.success)) {
      return { status: 'healthy', latency_ms: latency, version: result.version };
    }
    return { status: 'unhealthy', latency_ms: latency, error: '服务返回异常' };
  } catch {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: `${serviceName} 不可达` };
  }
}

/** 格式化运行时间 */
function formatUptime(uptimeSeconds: number): string {
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  if (days > 0) return `${days}天${hours}小时${minutes}分钟`;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
}

/**
 * GET /api/admin/stats - 仪表盘统计数据
 * 包含：服务健康、数据统计、系统信息、回测历史（空）
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    // 并行检查服务健康（Go 引擎为唯一计算引擎，ADR-008）
    const [engineHealth, goHealth] = await Promise.all([
      checkServiceHealth(config.GO_ENGINE_URL, '/api/engine/health', 'Go引擎'),
      checkServiceHealth(config.GO_DATA_SERVICE_URL, '/api/data/health', 'Go数据服务'),
    ]);

    // 回测历史：当请求带有活跃租户时，返回该租户最近的运行记录（ADR-034）。
    // 无租户上下文（如破窗平台密钥未选组织）时返回空数组，保持向后兼容。
    const tenantId = (req as AuthenticatedRequest).tenantId;
    let backtestHistory: BacktestRunRecord[] = [];
    if (tenantId) {
      try {
        const runsResult = await listRuns(tenantId, 20, 0);
        backtestHistory = runsResult.rows;
      } catch (err) {
        logger.warn({ err: String(err), tenantId }, '[Admin Stats] 回测历史查询失败，返回空');
      }
    }

    const [tickerStats, universeStats] = await Promise.all([
      scanTickersStats().then((s: DbMarketStats | null) => s ?? defaultTickerStats()),
      getUniverseStats(),
    ]);

    res.json({
      success: true,
      data: buildStatsResponseData({
        engineHealth,
        goHealth,
        tickerStats,
        universeStats,
        backtestHistory,
      }),
    });
  } catch (error) {
    logger.error({ err: error as Error }, '[Admin Stats] 获取统计数据失败');
    sendProblem(res, 500, 'ADMIN_STATS_ERROR', 'Admin Stats Error', { detail: '获取统计数据失败' });
  }
});

/**
 * GET /api/admin/system - 系统资源信息
 */
router.get('/system', async (_req: Request, res: Response): Promise<void> => {
  try {
    const memUsage = process.memoryUsage();
    const uptimeSeconds = process.uptime();

    const tickerStats =
      (await scanTickersStats()) ??
      ({
        total_cached: 0,
        data_quality: {
          with_adj_close: 0,
          with_dividends: 0,
          with_splits: 0,
          total_data_points: 0,
          total_size_mb: 0,
        },
      } as DbMarketStats);

    res.json({
      success: true,
      data: {
        memory: {
          rss: memUsage.rss,
          heap_total: memUsage.heapTotal,
          heap_used: memUsage.heapUsed,
          external: memUsage.external,
          array_buffers: memUsage.arrayBuffers,
          rss_mb: Math.round((memUsage.rss / 1024 / 1024) * 10) / 10,
          heap_used_mb: Math.round((memUsage.heapUsed / 1024 / 1024) * 10) / 10,
          heap_total_mb: Math.round((memUsage.heapTotal / 1024 / 1024) * 10) / 10,
        },
        uptime: {
          seconds: Math.round(uptimeSeconds),
          formatted: formatUptime(uptimeSeconds),
        },
        data_directory: {
          total_size_mb: tickerStats.data_quality.total_size_mb,
          ticker_file_count: tickerStats.total_cached,
          total_data_points: tickerStats.data_quality.total_data_points,
        },
      },
    });
  } catch (error) {
    logger.error({ err: error as Error }, '[Admin System] 获取系统信息失败');
    sendProblem(res, 500, 'ADMIN_SYSTEM_ERROR', 'Admin System Error', {
      detail: '获取系统信息失败',
    });
  }
});

export default router;
