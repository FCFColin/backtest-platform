/**
 * 数据路由
 * GET /api/data/history - 获取历史数据
 * GET /api/data/search - 搜索资产代码
 */

import { Router, type Request, type Response } from 'express';
import { fetchHistoryData, searchTickers } from '../services/dataService.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { registerCircuitBreakerMetrics, recordFallbackToNode } from '../utils/metrics.js';
import { sendProblem } from '../utils/errors.js';
import { callService } from '../utils/httpClient.js';
import { MAX_TICKERS } from '@backtest/shared/constants';
import { validateQuery } from '../middleware/validate.js';
import { historyQuerySchema, searchQuerySchema } from '../schemas/data.js';
import CircuitBreaker from 'opossum';
import { loadCpiSeriesFromDb } from '../db/macroData.js';

interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close?: number;
  volume: number;
}
async function callGoDataService(endpoint: string, options?: RequestInit): Promise<unknown | null> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> | undefined),
    'X-Data-Service-Auth': config.DATA_SERVICE_AUTH_TOKEN,
  };
  return callService(config.GO_DATA_SERVICE_URL, endpoint, { ...options, headers });
}

/**
 * Go 数据服务熔断器（T-P1-2）
 *
 * 企业理由：Go 数据服务故障时，每次请求等 30s 超时（callService timeoutMs=30000），
 * 高并发下调用方线程池被耗尽，引发雪崩。熔断器在错误率超阈值时 Open，
 * 快速失败（~0ms）直接走降级（本地 JSON/Python），避免拖垮调用方。
 *
 * 配置（复用 engineClient 模式）：
 * - errorThresholdPercentage: 50% 错误率触发熔断
 * - resetTimeout: 30s 后进入 HalfOpen 探测
 * - volumeThreshold: 至少 5 次请求才计算错误率（避免冷启动误熔断）
 *
 * 权衡：熔断 Open 期间所有请求直接降级（数据可能过期），但优于全量超时。
 */
const goDataServiceBreaker = new CircuitBreaker(
  async (endpoint: string, options?: RequestInit) => callGoDataService(endpoint, options),
  {
    timeout: 30000, // 与 callService 默认超时一致
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5,
    rollingCountTimeout: 60000,
    rollingCountBuckets: 10,
  },
);

goDataServiceBreaker.on('open', () => {
  logger.warn('[circuit-breaker] Go 数据服务熔断器进入 Open 状态，请求将直接降级');
  recordFallbackToNode('go_circuit_breaker_open');
});
goDataServiceBreaker.on('halfOpen', () => {
  logger.info('[circuit-breaker] Go 数据服务熔断器进入 Half-Open 状态，开始探测');
});
goDataServiceBreaker.on('close', () => {
  logger.info('[circuit-breaker] Go 数据服务熔断器恢复 Closed 状态');
});

// 注册熔断器状态到 Prometheus 指标（T-P1-1 Saturation）
registerCircuitBreakerMetrics('go_data_service', goDataServiceBreaker);

/**
 * 通过熔断器调用 Go 数据服务。
 *
 * 熔断器 Open 时 fire 抛出错误，捕获后返回 null（触发降级链）。
 * 这与 callService 内部失败返回 null 的语义一致，调用方无需感知熔断器存在。
 */
async function callGoDataServiceWithBreaker(
  endpoint: string,
  options?: RequestInit,
): Promise<unknown | null> {
  try {
    return await goDataServiceBreaker.fire(endpoint, options);
  } catch {
    // 熔断器 Open 或底层调用失败，返回 null 触发降级
    return null;
  }
}

function convertPricePointsToMap(
  goData: Record<string, PricePoint[]>,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const [ticker, points] of Object.entries(goData)) {
    const map: Record<string, number> = {};
    for (const point of points) {
      map[point.date] = point.adj_close ?? point.close;
    }
    result[ticker] = map;
  }
  return result;
}

const router = Router();

/**
 * 获取历史行情数据
 * GET /api/data/history?tickers=SPY,VTI&startDate=2020-01-01&endDate=2024-12-31
 */
router.get(
  '/history',
  validateQuery(historyQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { tickers, startDate, endDate } = req.query as {
        tickers: string;
        startDate: string;
        endDate: string;
      };

      const tickerList = tickers
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (tickerList.length > MAX_TICKERS) {
        sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED', 'Ticker limit exceeded', {
          detail: `ticker 数量超过限制 (max ${MAX_TICKERS})`,
        });
        return;
      }

      let data: Record<string, Record<string, number>>;
      let degraded: boolean = false;
      const goResult = (await callGoDataServiceWithBreaker('/api/data/price/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: tickerList, startDate, endDate }),
      })) as { success: boolean; data?: Record<string, PricePoint[]> } | null;
      if (goResult && goResult.success && goResult.data) {
        data = convertPricePointsToMap(goResult.data);
      } else {
        /**
         * Go 服务降级到 Node.js 本地数据
         *
         * 企业理由：Go 数据服务不可用时降级到本地数据源保证可用性，
         * 但本地数据可能存在延迟或精度差异，必须通过 degraded 标记
         * 让前端/调用方感知，以便展示提示或调整业务逻辑。
         * 权衡：降级标记增加了响应体字段，但这是可观测性的最小代价。
         */
        degraded = true;
        data = await fetchHistoryData(tickerList, startDate, endDate);
      }

      const response: Record<string, unknown> = { success: true, data };
      if (degraded) {
        response.degraded = true;
        response.degradedWarning = 'Go 数据服务不可用，已降级到本地数据源';
      }
      res.json(response);
    } catch (error) {
      logger.error({ err: error as Error }, 'History data fetch error');
      sendProblem(res, 500, 'HISTORY_FETCH_ERROR', 'History Fetch Error', {
        detail: 'Failed to fetch history data',
      });
    }
  },
);

/**
 * 搜索资产代码
 * GET /api/data/search?query=茅台&market=A股
 */
router.get(
  '/search',
  validateQuery(searchQuerySchema),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { query, market } = req.query as { query: string; market?: string };

      let results;
      let degraded: boolean = false;
      const goResult = (await callGoDataServiceWithBreaker(
        `/api/data/search?q=${encodeURIComponent(query as string)}`,
      )) as { success: boolean; data?: unknown } | null;
      if (goResult && goResult.success && goResult.data) {
        results = goResult.data;
      } else {
        /**
         * Go 服务降级到 Node.js 本地搜索
         *
         * 企业理由：同 /history 降级逻辑，降级时必须标记，
         * 让调用方感知数据可能不完整。
         * 权衡：同上。
         */
        degraded = true;
        results = await searchTickers(query, market);
      }

      const response: Record<string, unknown> = { success: true, data: results };
      if (degraded) {
        response.degraded = true;
        response.degradedWarning = 'Go 数据服务不可用，已降级到本地搜索';
      }
      res.json(response);
    } catch (error) {
      logger.error({ err: error as Error }, 'Ticker search error');
      sendProblem(res, 500, 'SEARCH_ERROR', 'Search failed', {
        detail: 'Failed to search tickers',
      });
    }
  },
);

/**
 * 获取CPI数据
 * GET /api/data/cpi/:country
 */
const cpiDbCache: Record<string, unknown> = {};

router.get('/cpi/:country', async (req: Request, res: Response): Promise<void> => {
  try {
    const country = req.params.country;

    if (country !== 'us' && country !== 'cn') {
      sendProblem(res, 422, 'INVALID_COUNTRY', 'Invalid country parameter', {
        detail: '仅支持 us 或 cn 的CPI数据',
      });
      return;
    }

    const goResult = (await callGoDataServiceWithBreaker(`/api/data/cpi/${country}`)) as {
      success: boolean;
      data?: unknown;
    } | null;
    if (goResult && goResult.success && goResult.data) {
      res.json({ success: true, data: goResult.data });
      return;
    }

    if (cpiDbCache[country]) {
      res.json({
        success: true,
        data: cpiDbCache[country],
        degraded: true,
        degradedWarning: 'Go 数据服务不可用，已降级到 PostgreSQL CPI 数据',
      });
      return;
    }

    const cpiData = await loadCpiSeriesFromDb(country);
    if (cpiData.length > 0) {
      cpiDbCache[country] = cpiData;
      res.json({
        success: true,
        data: cpiData,
        degraded: true,
        degradedWarning: 'Go 数据服务不可用，已降级到 PostgreSQL CPI 数据',
      });
      return;
    }

    sendProblem(res, 404, 'CPI_NOT_FOUND', 'CPI data not found', {
      detail: 'PostgreSQL 中无 CPI 数据，请先运行 import:tickers',
    });
  } catch (error) {
    logger.error({ err: error as Error }, 'CPI data fetch error');
    sendProblem(res, 500, 'CPI_FETCH_ERROR', 'CPI fetch failed', {
      detail: 'Failed to fetch CPI data',
    });
  }
});

export default router;
