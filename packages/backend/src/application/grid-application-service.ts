/**
 * 战术网格搜索应用服务（T-30 / CQRS Command）
 */
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { sanitizeLog } from '../utils/logSanitizer.js';
import { runGridSearch, type TacticalGridRequest } from '../engine/tacticalGrid.js';

export type { TacticalGridRequest };

export const MAX_GRID_COMBINATIONS = 200;

/**
 * 执行网格搜索（供 Worker 与同步回退共用）。
 */
/** 验证网格搜索请求，返回错误消息或 null */
function validateGridSearchRequest(request: TacticalGridRequest): string | null {
  if (!request.indicator || !request.param1 || !request.param2) {
    return '缺少必要参数: indicator, param1, param2';
  }
  if (!request.tickers || request.tickers.length === 0) {
    return '请至少输入一个标的代码';
  }
  if (!request.startDate || !request.endDate) {
    return '缺少起止日期';
  }
  return null;
}

/** 生成参数值列表 */
function generateParamValues(range: { min: number; max: number; step: number }): number[] {
  const values: number[] = [];
  if (range.step > 0) {
    for (let v = range.min; v <= range.max + 1e-9; v += range.step) {
      values.push(Math.round(v * 1000) / 1000);
    }
  } else {
    values.push(range.min);
  }
  return values;
}

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

  const param1Values = generateParamValues(param1Range);
  const param2Values = generateParamValues(param2Range);
  const totalCombinations = param1Values.length * param2Values.length;

  if (totalCombinations > MAX_GRID_COMBINATIONS) {
    return {
      success: false,
      error: `参数组合过多(${totalCombinations})，请缩小参数范围（上限${MAX_GRID_COMBINATIONS}）`,
    };
  }

  const tradingTicker = tickers[0].toUpperCase();
  const priceData = await fetchHistoryData([tradingTicker], startDate, endDate);

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

  const response = runGridSearch(request, priceData, dates, prices, tradingTicker);

  logger.info(
    `[tactical-grid] 网格搜索完成: ${totalCombinations}个组合, 耗时${Date.now() - startTime}ms`,
  );

  return { success: true, data: response as unknown as Record<string, unknown> };
}
