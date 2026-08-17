import { fetchHistoryData } from '../infrastructure/dataFacade.js';
import { logger, sanitizeLog } from '../utils/logger.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { tacticalGridResultSchema } from '../schemas/engineSchemas.js';
import { ValidationError } from '../utils/errors.js';
import {
  MAX_GRID_COMBINATIONS,
  validateGridSearchRequest,
  countCombinations,
  type GridSearchDomainRequest,
} from '../domain/services/grid-search.js';

export { MAX_GRID_COMBINATIONS, countCombinations };

export type TacticalGridRequest = GridSearchDomainRequest;

export async function executeGridSearch(
  request: TacticalGridRequest,
): Promise<Record<string, unknown>> {
  const startTime = Date.now();

  const validationError = validateGridSearchRequest(request);
  if (validationError) throw new ValidationError(validationError);

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

  if (totalCombinations > MAX_GRID_COMBINATIONS)
    throw new ValidationError(
      `参数组合过多(${totalCombinations})，请缩小参数范围（上限${MAX_GRID_COMBINATIONS}）`,
    );

  const tradingTicker = tickers[0].toUpperCase();
  const { data: priceData } = await fetchHistoryData([tradingTicker], startDate, endDate);

  if (!priceData[tradingTicker] || Object.keys(priceData[tradingTicker]).length === 0)
    throw new ValidationError(`未找到 ${tradingTicker} 的价格数据`);

  const datePriceMap = priceData[tradingTicker];
  const dates = Object.keys(datePriceMap)
    .sort()
    .filter((d) => d >= startDate && d <= endDate);
  const prices = dates.map((d) => datePriceMap[d]);

  if (dates.length < 10) throw new ValidationError('有效交易日不足，无法运行网格搜索');

  const response = await callEngineStrict(
    '/api/engine/tactical-grid-search',
    {
      ...request,
      priceData,
      dates,
      prices,
      tradingTicker,
    },
    tacticalGridResultSchema,
  );

  logger.info(
    `[tactical-grid] 网格搜索完成: ${totalCombinations}个组合, 耗时${Date.now() - startTime}ms`,
  );

  return response as Record<string, unknown>;
}
