import type {
  BacktestParameters,
  RebalanceFrequency,
  BacktestOptimizerObjective,
  OptimizeResultItem,
  BestResultItem,
} from '@backtest/shared/types';
import { numericRange } from '../../utils/misc.js';

export interface BacktestOptimizerRequest {
  portfolio: {
    name?: string;
    assets: Array<{ ticker: string; weight: number }>;
  };
  parameterSpace: {
    rebalanceFrequencies: RebalanceFrequency[];
    rebalanceThreshold?: { min: number; max: number; step: number };
    initialCapital: { min: number; max: number; step: number };
  };
  parameters: {
    startDate: string;
    endDate: string;
    benchmarkTicker?: string;
    baseCurrency?: 'usd' | 'cny';
    adjustForInflation?: boolean;
  };
  objective: BacktestOptimizerObjective;
  constraints?: { maxDrawdown?: number; minCagr?: number };
}
export type { OptimizeResultItem, BestResultItem };

export interface Combo {
  frequency: RebalanceFrequency;
  threshold?: number;
  capital: number;
}

export const MAX_OPTIMIZER_COMBINATIONS = 1000;

export function range(min: number, max: number, step: number): number[] {
  return numericRange(min, max, step, 2);
}

export function buildBacktestParameters(
  parameters: BacktestOptimizerRequest['parameters'],
  startingValue: number,
): BacktestParameters {
  return {
    startDate: parameters.startDate,
    endDate: parameters.endDate,
    startingValue,
    baseCurrency: parameters.baseCurrency || 'usd',
    adjustForInflation: parameters.adjustForInflation ?? false,
    rollingWindowMonths: 12,
    benchmarkTicker: parameters.benchmarkTicker || '',
    cashflowLegs: [],
    oneTimeCashflows: [],
  };
}

export function validateOptimizeRequest(body: BacktestOptimizerRequest): string | null {
  if (!body.portfolio?.assets || body.portfolio.assets.length === 0) {
    return '缺少组合配置：portfolio.assets';
  }
  if (!body.parameterSpace?.rebalanceFrequencies?.length) {
    return '请至少选择一个再平衡频率';
  }
  if (!body.parameters?.startDate || !body.parameters?.endDate) {
    return '缺少回测日期范围';
  }
  return null;
}

export function buildCombinations(
  parameterSpace: BacktestOptimizerRequest['parameterSpace'],
): Combo[] {
  const capitals = range(
    parameterSpace.initialCapital.min,
    parameterSpace.initialCapital.max,
    parameterSpace.initialCapital.step,
  );
  const thresholds = parameterSpace.rebalanceThreshold
    ? range(
        parameterSpace.rebalanceThreshold.min,
        parameterSpace.rebalanceThreshold.max,
        parameterSpace.rebalanceThreshold.step,
      )
    : [];

  const combos: Combo[] = [];
  for (const freq of parameterSpace.rebalanceFrequencies) {
    for (const cap of capitals) {
      combos.push({ frequency: freq, capital: cap });
    }
  }
  if (thresholds.length > 0) {
    for (const thr of thresholds) {
      for (const cap of capitals) {
        combos.push({ frequency: 'threshold', threshold: thr, capital: cap });
      }
    }
  }
  return combos;
}

export function filterByConstraints(
  items: OptimizeResultItem[],
  constraints?: BacktestOptimizerRequest['constraints'],
): OptimizeResultItem[] {
  if (!constraints) return items;
  return items.filter((it) => {
    if (constraints.maxDrawdown !== undefined && it.maxDrawdown > constraints.maxDrawdown / 100)
      return false;
    if (constraints.minCagr !== undefined && it.cagr < constraints.minCagr / 100) return false;
    return true;
  });
}

export function objectiveValue(
  it: OptimizeResultItem,
  objective: BacktestOptimizerObjective,
): number {
  switch (objective) {
    case 'maxCagr':
      return it.cagr;
    case 'minMaxDrawdown':
      return -it.maxDrawdown;
    case 'maxSharpe':
      return it.sharpe;
    case 'maxSortino':
      return it.sortino;
    default:
      return it.cagr;
  }
}
