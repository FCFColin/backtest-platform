import type { GridParamRange } from '@backtest/shared/types/tactical';

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

function countRangeValues(range: GridParamRange): number {
  if (range.step <= 0) return 1;
  if (range.min > range.max) return 0;
  return Math.floor((range.max - range.min + 1e-9) / range.step) + 1;
}

export function countCombinations(param1: GridParamRange, param2: GridParamRange): number {
  return countRangeValues(param1) * countRangeValues(param2);
}
