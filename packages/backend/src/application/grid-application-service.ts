/**
 * 战术网格搜索应用服务。
 *
 * 计算逻辑已迁移到 Go 引擎 /api/engine/tactical-grid-search（ADR-031）。
 * 纯领域逻辑（参数校验、参数生成、组合计数）在 domain/services/grid-search.ts 中。
 */
import { fetchHistoryData } from '../infrastructure/dataFacade.js';
import { logger } from '../utils/logger.js';
import { sanitizeLog } from '../utils/logSanitizer.js';
import { callEngineStrict } from '../utils/engineClient.js';
import {
  MAX_GRID_COMBINATIONS,
  validateGridSearchRequest,
  countCombinations,
  type GridSearchDomainRequest,
} from '../domain/services/grid-search.js';

export { MAX_GRID_COMBINATIONS };

export type TacticalGridRequest = GridSearchDomainRequest;

export async function executeGridSearch(body: Record<string, unknown>): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  const startTime = Date.now();
  const request = body as unknown as TacticalGridRequest;

  const validationError = validateGridSearchRequest(request);
  if (validationError) return { success: false, error: validationError };

  const {
    indicator,
    param1: param1Range,
    param2: param2Range,
    tickers,
    startDate,
    endDate,
    objective,
  } = request;

  logger.info(
    `[tactical-grid] 开始网格搜索: indicator=${indicator}, ticker=${sanitizeLog(tickers[0])}, objective=${objective}`,
  );

  const totalCombinations = countCombinations(param1Range, param2Range);

  if (totalCombinations > MAX_GRID_COMBINATIONS) {
    return {
      success: false,
      error: `参数组合过多(${totalCombinations})，请缩小参数范围（上限${MAX_GRID_COMBINATIONS}）`,
    };
  }

  const tradingTicker = tickers[0].toUpperCase();
  const { data: priceData } = await fetchHistoryData([tradingTicker], startDate, endDate);

  if (!priceData[tradingTicker] || Object.keys(priceData[tradingTicker]).length === 0) {
    return { success: false, error: `未找到 ${tradingTicker} 的价格数据` };
  }

  const datePriceMap = priceData[tradingTicker];
  const dates = Object.keys(datePriceMap)
    .sort()
    .filter((d) => d >= startDate && d <= endDate);
  const prices = dates.map((d) => datePriceMap[d]);

  if (dates.length < 10) {
    return { success: false, error: '有效交易日不足，无法运行网格搜索' };
  }

  const response = await callEngineStrict('/api/engine/tactical-grid-search', {
    ...request,
    priceData,
    dates,
    prices,
    tradingTicker,
  });

  logger.info(
    `[tactical-grid] 网格搜索完成: ${totalCombinations}个组合, 耗时${Date.now() - startTime}ms`,
  );

  return { success: true, data: response as unknown as Record<string, unknown> };
}
