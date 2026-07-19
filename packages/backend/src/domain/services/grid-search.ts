/**
 * 战术网格搜索领域逻辑。
 *
 * 纯函数、无副作用，可独立单元测试。
 * 从 grid-application-service.ts 抽离，使 application 层只负责编排。
 */

export const MAX_GRID_COMBINATIONS = 200;

export interface GridParamRange {
  min: number;
  max: number;
  step: number;
}

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

/** 校验网格搜索请求，返回错误消息或 null */
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

/** 生成参数值列表 */
export function generateParamValues(range: GridParamRange): number[] {
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

/** 计算参数组合总数 */
export function countCombinations(param1: GridParamRange, param2: GridParamRange): number {
  return generateParamValues(param1).length * generateParamValues(param2).length;
}

/** 检查参数组合数是否超限 */
export function isWithinCombinationLimit(param1: GridParamRange, param2: GridParamRange): boolean {
  return countCombinations(param1, param2) <= MAX_GRID_COMBINATIONS;
}
