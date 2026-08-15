import type { GridParamRange } from '@backtest/shared/types/tactical';
import { numericRange } from '../../utils/misc.js';

export const MAX_GRID_COMBINATIONS = 200;

export interface GridSearchDomainRequest {
  indicator: string;
  param1: GridParamRange;
  param2: GridParamRange;
  tickers: string[];
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: string;
  objective: string;
  topN?: number;
}

export function validateGridSearchRequest(request: GridSearchDomainRequest): string | null {
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

// 与 numericRange 实际生成数保持一致（step 精度取整影响真实组合数）
function countRangeValues(range: GridParamRange): number {
  if (range.step <= 0) return 1;
  if (range.min > range.max) return 0;
  return numericRange(range.min, range.max, range.step).length;
}

export function countCombinations(param1: GridParamRange, param2: GridParamRange): number {
  return countRangeValues(param1) * countRangeValues(param2);
}
