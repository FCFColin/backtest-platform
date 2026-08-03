import { Router, type Request, type Response } from 'express';
import { callService } from '../utils/httpClient.js';
import { scanTickersStats, getUniverseStats } from '../infrastructure/dataQuery.js';
import type { DbMarketStats } from '../db/marketStats.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { adminMiddleware } from '../middleware/middlewareChains.js';
import { listRuns, type BacktestRunRecord } from '../repositories/backtestRunRepo.js';
import { crudRouteHandler } from './routeUtils.js';

const router = Router();

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

function collectSystemSnapshot() {
  const m = process.memoryUsage();
  const uptimeSeconds = process.uptime();
  return {
    memory: {
      rss: m.rss,
      heapUsed: m.heapUsed,
      heapTotal: m.heapTotal,
      external: m.external,
      arrayBuffers: m.arrayBuffers,
      rssMb: toMB(m.rss),
      heapUsedMb: toMB(m.heapUsed),
      heapTotalMb: toMB(m.heapTotal),
      externalMb: toMB(m.external),
    },
    uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds),
  };
}

function buildStatsResponseData({
  engineHealth,
  goHealth,
  tickerStats,
  universeStats,
  backtestHistory,
  system,
}: {
  engineHealth: Awaited<ReturnType<typeof checkServiceHealth>>;
  goHealth: Awaited<ReturnType<typeof checkServiceHealth>>;
  tickerStats: DbMarketStats;
  universeStats: Awaited<ReturnType<typeof getUniverseStats>>;
  backtestHistory: BacktestRunRecord[];
  system: ReturnType<typeof collectSystemSnapshot>;
}) {
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
        rss_mb: system.memory.rssMb,
        heap_used_mb: system.memory.heapUsedMb,
        heap_total_mb: system.memory.heapTotalMb,
        external_mb: system.memory.externalMb,
      },
      uptime_seconds: Math.round(system.uptimeSeconds),
      uptime_formatted: system.uptimeFormatted,
    },
    backtest_history: backtestHistory,
  };
}

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

const toMB = (v: number): number => Math.round((v / 1024 / 1024) * 10) / 10;

/** 格式化运行时间 */
function formatUptime(uptimeSeconds: number): string {
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  if (days > 0) return `${days}天${hours}小时${minutes}分钟`;
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
}

router.get(
  '/stats',
  ...adminMiddleware(),
  crudRouteHandler(
    async (req, res): Promise<void> => {
      const [engineHealth, goHealth] = await Promise.all([
        checkServiceHealth(config.GO_ENGINE_URL, '/api/engine/health', 'Go引擎'),
        checkServiceHealth(config.GO_DATA_SERVICE_URL, '/api/data/health', 'Go数据服务'),
      ]);

      const tenantId = req.tenantId;
      let backtestHistory: BacktestRunRecord[] = [];
      if (tenantId) {
        try {
          backtestHistory = await listRuns(tenantId, 20);
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
          system: collectSystemSnapshot(),
        }),
      });
    },
    {
      logMsg: '[Admin Stats] 获取统计数据失败',
      code: 'ADMIN_STATS_ERROR',
    },
  ),
);

router.get(
  '/system',
  ...adminMiddleware(),
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const system = collectSystemSnapshot();
      const tickerStats = (await scanTickersStats()) ?? defaultTickerStats();

      res.json({
        success: true,
        data: {
          memory: {
            rss: system.memory.rss,
            heap_total: system.memory.heapTotal,
            heap_used: system.memory.heapUsed,
            external: system.memory.external,
            array_buffers: system.memory.arrayBuffers,
            rss_mb: system.memory.rssMb,
            heap_used_mb: system.memory.heapUsedMb,
            heap_total_mb: system.memory.heapTotalMb,
          },
          uptime: {
            seconds: Math.round(system.uptimeSeconds),
            formatted: system.uptimeFormatted,
          },
          data_directory: {
            total_size_mb: tickerStats.data_quality.total_size_mb,
            ticker_file_count: tickerStats.total_cached,
            total_data_points: tickerStats.data_quality.total_data_points,
          },
        },
      });
    },
    {
      logMsg: '[Admin System] 获取系统信息失败',
      code: 'ADMIN_SYSTEM_ERROR',
    },
  ),
);

export default router;
