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

function generateParamValues(range: GridParamRange): number[] {
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

export function countCombinations(param1: GridParamRange, param2: GridParamRange): number {
  return generateParamValues(param1).length * generateParamValues(param2).length;
}