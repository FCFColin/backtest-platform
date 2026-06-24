/**
 * 管理后台路由
 * GET /api/admin/stats  - 仪表盘统计数据
 * GET /api/admin/system - 系统资源信息
 */

import { Router, type Request, type Response } from 'express';
import { callService } from './dataRoutes.js';
import { scanTickersStats, getUniverseStats } from '../services/engineService.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const router = Router();

/** 检查服务健康状态，失败时返回降级数据 */
async function checkServiceHealth(
  baseUrl: string,
  endpoint: string,
  serviceName: string,
): Promise<{ status: 'healthy' | 'unhealthy'; latency_ms: number; version?: string; error?: string }> {
  const start = Date.now();
  try {
    const result = await callService(baseUrl, endpoint, undefined, 5000) as { status?: string; success?: boolean; version?: string } | null;
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
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    // 并行检查服务健康
    const [rustHealth, goHealth] = await Promise.all([
      checkServiceHealth(config.RUST_ENGINE_URL, '/api/engine/health', 'Rust引擎'),
      checkServiceHealth(config.GO_DATA_SERVICE_URL, '/api/data/health', 'Go数据服务'),
    ]);

    // 复用已有的统计扫描（无缓存时返回 null，提供空对象兜底避免阻塞事件循环）
    const tickerStats = scanTickersStats() ?? {
      total_cached: 0,
      by_market: {},
      by_type: {},
      by_exchange: {},
      date_ranges: { earliest: null, latest: null },
      by_decade: {},
      by_year_count: {},
      coverage: { tickers_with_5y_plus: 0, tickers_with_10y_plus: 0, tickers_with_20y_plus: 0, avg_data_points: 0, median_data_points: 0 },
      data_quality: { with_adj_close: 0, with_dividends: 0, with_splits: 0, total_data_points: 0, total_size_mb: 0 },
      recent_updates: [],
      sample_tickers: {},
      generated_at: '',
    };
    const universeStats = getUniverseStats();

    // 系统信息
    const memUsage = process.memoryUsage();
    const uptimeSeconds = process.uptime();

    res.json({
      success: true,
      data: {
        services: {
          rust_engine: rustHealth,
          go_data_service: goHealth,
        },
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
            rss_mb: Math.round(memUsage.rss / 1024 / 1024 * 10) / 10,
            heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024 * 10) / 10,
            heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024 * 10) / 10,
            external_mb: Math.round(memUsage.external / 1024 / 1024 * 10) / 10,
          },
          uptime_seconds: Math.round(uptimeSeconds),
          uptime_formatted: formatUptime(uptimeSeconds),
        },
        backtest_history: [],
      },
    });
  } catch (error) {
    logger.error({ err: error as Error }, '[Admin Stats] 获取统计数据失败');
    res.status(500).json({ success: false, error: { code: 'ADMIN_STATS_ERROR', message: '获取统计数据失败' } });
  }
});

/**
 * GET /api/admin/system - 系统资源信息
 */
router.get('/system', (_req: Request, res: Response): void => {
  try {
    const memUsage = process.memoryUsage();
    const uptimeSeconds = process.uptime();

    // 复用 scanTickersStats 获取目录信息（无缓存时返回 null，提供空对象兜底）
    const tickerStats = scanTickersStats() ?? {
      total_cached: 0,
      data_quality: { with_adj_close: 0, with_dividends: 0, with_splits: 0, total_data_points: 0, total_size_mb: 0 },
    };

    res.json({
      success: true,
      data: {
        memory: {
          rss: memUsage.rss,
          heap_total: memUsage.heapTotal,
          heap_used: memUsage.heapUsed,
          external: memUsage.external,
          array_buffers: memUsage.arrayBuffers,
          rss_mb: Math.round(memUsage.rss / 1024 / 1024 * 10) / 10,
          heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024 * 10) / 10,
          heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024 * 10) / 10,
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
    res.status(500).json({ success: false, error: { code: 'ADMIN_SYSTEM_ERROR', message: '获取系统信息失败' } });
  }
});

export default router;
