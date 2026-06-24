/**
 * 数据路由
 * GET /api/data/history - 获取历史数据
 * GET /api/data/search - 搜索资产代码
 */

import { Router, type Request, type Response } from 'express';
import { fetchHistoryData, searchTickers } from '../services/dataService.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getRequestId } from '../utils/requestContext.js';
import { registerCircuitBreakerMetrics, recordFallbackToNode } from '../utils/metrics.js';
import { sendProblem } from '../utils/errors.js';
import { MAX_TICKERS } from '../../shared/constants.js';
import CircuitBreaker from 'opossum';
import fs from 'fs';
import path from 'path';

interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adj_close?: number;
  volume: number;
}

/**
 * 调用外部 HTTP 服务（Go 数据服务 / Rust 引擎等），统一封装超时与降级处理。
 *
 * 调用流程：
 * 1. 使用 AbortController 在 `timeoutMs` 毫秒后中断请求；
 * 2. 若 HTTP 状态非 2xx，记录告警并返回 `null`，由调用方走降级路径；
 * 3. 若发生超时（AbortError）或其他异常，记录告警并返回 `null`。
 *
 * 降级行为说明：
 * - 本函数**不抛异常**，任何失败均返回 `null`，调用方需通过判断 `null` 走降级逻辑
 *   （如 Go 数据服务失败时降级到 Python 子进程或本地 JSON 文件）；
 * - 超时默认 30 秒（适用于 Go 数据服务的批量行情请求），调用方可按场景覆盖；
 * - 所有失败均通过 `logger.warn` 记录，便于排查降级原因。
 *
 * @param baseUrl - 目标服务基础地址，如 `http://127.0.0.1:5003`
 * @param endpoint - 接口路径（含 query string），会拼接在 `baseUrl` 之后
 * @param options - 透传给 `fetch` 的初始化参数（method/headers/body 等）
 * @param timeoutMs - 超时毫秒数，超时后触发 AbortController 中断请求，默认 30000ms
 * @returns 成功时返回解析后的 JSON 响应；失败（非 2xx / 超时 / 网络错误）时返回 `null`
 */
export async function callService(baseUrl: string, endpoint: string, options?: RequestInit, timeoutMs = 30000): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    // 企业理由：将 request_id 传播到下游服务（Go/Rust），使其日志可与本服务关联。
    // 无此传播时，下游服务日志无法定位属于哪个上游请求，跨服务排障断裂。
    const requestId = getRequestId();
    const headers: Record<string, string> = { ...(options?.headers as Record<string, string> | undefined) };
    if (requestId) {
      headers['x-request-id'] = requestId;
    }
    const resp = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      logger.warn(`[服务调用] ${baseUrl}${endpoint} HTTP ${resp.status}，响应体: ${body.slice(0, 500)}，降级到Node.js`);
      return null;
    }
    return await resp.json();
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      logger.warn(`[服务调用] ${baseUrl} 不可用，降级到Node.js`);
    } else {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`[服务调用] ${baseUrl}${endpoint} 调用失败，降级到Node.js: ${errMsg}`);
    }
    return null;
  }
}

async function callGoDataService(endpoint: string, options?: RequestInit): Promise<unknown | null> {
  return callService(config.GO_DATA_SERVICE_URL, endpoint, options);
}

/**
 * Go 数据服务熔断器（T-P1-2）
 *
 * 企业理由：Go 数据服务故障时，每次请求等 30s 超时（callService timeoutMs=30000），
 * 高并发下调用方线程池被耗尽，引发雪崩。熔断器在错误率超阈值时 Open，
 * 快速失败（~0ms）直接走降级（本地 JSON/Python），避免拖垮调用方。
 *
 * 配置（复用 rustFallback 模式）：
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
async function callGoDataServiceWithBreaker(endpoint: string, options?: RequestInit): Promise<unknown | null> {
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
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const { tickers, startDate, endDate } = req.query;

    if (!tickers || !startDate || !endDate) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing required parameters', 'Missing required parameters: tickers, startDate, endDate');
      return;
    }

    const tickerList = (tickers as string).split(',').map((t) => t.trim()).filter(Boolean);

    if (tickerList.length > MAX_TICKERS) {
      sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED', 'Ticker limit exceeded', `ticker 数量超过限制 (max ${MAX_TICKERS})`);
      return;
    }

    let data: Record<string, Record<string, number>>;
    let degraded: boolean = false;
    const goResult = await callGoDataServiceWithBreaker('/api/data/price/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: tickerList, startDate, endDate }),
    }) as { success: boolean; data?: Record<string, PricePoint[]> } | null;
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
      data = await fetchHistoryData(tickerList, startDate as string, endDate as string);
    }

    const response: Record<string, unknown> = { success: true, data };
    if (degraded) {
      response.degraded = true;
      response.degradedCode = 'GO_SERVICE_UNAVAILABLE';
      response.degradedMessage = 'Go 数据服务不可用，已降级到本地数据源';
    }
    res.json(response);
  } catch (error) {
    logger.error({ err: error as Error }, 'History data fetch error');
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/history-fetch-error', title: 'History Fetch Error', status: 500, code: 'HISTORY_FETCH_ERROR', detail: 'Failed to fetch history data' } });
  }
});

/**
 * 搜索资产代码
 * GET /api/data/search?query=茅台&market=A股
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { query, market } = req.query;

    if (!query) {
      sendProblem(res, 422, 'MISSING_PARAMS', 'Missing required parameter', 'Missing required parameter: query');
      return;
    }

    let results;
    let degraded: boolean = false;
    const goResult = await callGoDataServiceWithBreaker(`/api/data/search?q=${encodeURIComponent(query as string)}`) as { success: boolean; data?: unknown } | null;
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
      results = await searchTickers(query as string, market as string | undefined);
    }

    const response: Record<string, unknown> = { success: true, data: results };
    if (degraded) {
      response.degraded = true;
      response.degradedCode = 'GO_SERVICE_UNAVAILABLE';
      response.degradedMessage = 'Go 数据服务不可用，已降级到本地搜索';
    }
    res.json(response);
  } catch (error) {
    logger.error({ err: error as Error }, 'Ticker search error');
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/search-error', title: 'Search Error', status: 500, code: 'SEARCH_ERROR', detail: 'Failed to search tickers' } });
  }
});

/**
 * 获取CPI数据
 * GET /api/data/cpi/:country
 */
router.get('/cpi/:country', async (req: Request, res: Response): Promise<void> => {
  try {
    const country = req.params.country;

    if (country !== 'us' && country !== 'cn') {
      sendProblem(res, 422, 'INVALID_COUNTRY', 'Invalid country parameter', '仅支持 us 或 cn 的CPI数据');
      return;
    }

    // 优先从Go服务获取
    const goResult = await callGoDataServiceWithBreaker(`/api/data/cpi/${country}`) as { success: boolean; data?: unknown } | null;
    if (goResult && goResult.success && goResult.data) {
      res.json({ success: true, data: goResult.data });
      return;
    }

    /**
     * Go 服务降级到本地文件
     *
     * 企业理由：同 /history 降级逻辑，CPI 数据降级到本地文件时
     * 可能存在更新延迟，必须标记让调用方感知。
     * 权衡：同上。
     */
    // 降级：直接读取本地文件
    const fileName = country === 'cn' ? 'cn_cpi.json' : 'us_cpi.json';
    const cpiFilePath = path.resolve(process.cwd(), 'data', 'market', 'cpi', fileName);
    if (fs.existsSync(cpiFilePath)) {
      const cpiData = JSON.parse(fs.readFileSync(cpiFilePath, 'utf-8'));
      res.json({
        success: true,
        data: cpiData,
        degraded: true,
        degradedCode: 'GO_SERVICE_UNAVAILABLE',
        degradedMessage: 'Go 数据服务不可用，已降级到本地 CPI 数据文件',
      });
      return;
    }

    sendProblem(res, 404, 'CPI_NOT_FOUND', 'CPI data not found', 'CPI数据文件不存在');
  } catch (error) {
    logger.error({ err: error as Error }, 'CPI data fetch error');
    res.status(500).json({ success: false, error: { type: 'https://backtest.platform/errors/cpi-fetch-error', title: 'CPI Fetch Error', status: 500, code: 'CPI_FETCH_ERROR', detail: 'Failed to fetch CPI data' } });
  }
});

export default router;
