/**
 * 回测优化器应用服务（T-30 / CQRS Command）
 */
import type { Portfolio, BacktestParameters, RebalanceFrequency } from '@backtest/shared/types.js';
import { runPortfolioBacktest } from '../engine/portfolio.js';
import { fetchHistoryData } from '../services/dataService.js';
import { logger } from '../utils/logger.js';
import { numericRange } from '../utils/numericRange.js';

type Objective = 'maxCagr' | 'minMaxDrawdown' | 'maxSharpe' | 'maxSortino';

interface OptimizeResultItem {
  rebalanceFrequency: RebalanceFrequency;
  rebalanceThreshold?: number;
  initialCapital: number;
  cagr: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  stdev: number;
  calmar: number;
}

interface BestResultItem extends OptimizeResultItem {
  growthCurve: Array<{ date: string; value: number }>;
}

/** 参数组合（频率+阈值+资金） */
interface Combo {
  frequency: RebalanceFrequency;
  threshold?: number;
  capital: number;
}

interface OptimizeRequest {
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
  objective: Objective;
  constraints?: {
    maxDrawdown?: number;
    minCagr?: number;
  };
}

export const MAX_OPTIMIZER_COMBINATIONS = 1000;

function range(min: number, max: number, step: number): number[] {
  return numericRange(min, max, step, 2);
}

function buildBacktestParameters(
  parameters: OptimizeRequest['parameters'],
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
    extendedWithdrawalStats: false,
    cashflowLegs: [],
    oneTimeCashflows: [],
  };
}

/** 验证优化请求参数，返回错误消息或 null */
function validateOptimizeRequest(body: OptimizeRequest): string | null {
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

/** 构建参数组合列表 */
function buildCombinations(parameterSpace: OptimizeRequest['parameterSpace']): Combo[] {
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

/** 按资金分组运行回测，收集结果项 */
function runBacktestGroups(
  combos: Combo[],
  portfolio: OptimizeRequest['portfolio'],
  parameters: OptimizeRequest['parameters'],
  priceData: Record<string, Record<string, number>>,
): { items: OptimizeResultItem[] } {
  const items: OptimizeResultItem[] = [];

  const byCapital = new Map<number, Combo[]>();
  for (const c of combos) {
    if (!byCapital.has(c.capital)) byCapital.set(c.capital, []);
    byCapital.get(c.capital)!.push(c);
  }

  for (const [capital, group] of byCapital) {
    const portfolios: Portfolio[] = group.map((c, idx) => ({
      id: `opt-${idx}`,
      name: c.frequency === 'threshold' ? `threshold-${c.threshold}` : c.frequency,
      assets: portfolio.assets.map((a) => ({ ticker: a.ticker, weight: a.weight })),
      rebalanceFrequency: c.frequency,
      rebalanceThreshold: c.threshold,
      rebalanceOffset: 0,
      drag: 0,
      totalReturn: true,
    }));
    const btParams = buildBacktestParameters(parameters, capital);
    const btResult = runPortfolioBacktest(portfolios, priceData, btParams);

    for (let j = 0; j < group.length; j++) {
      const stats = btResult.portfolios[j].statistics;
      items.push({
        rebalanceFrequency: group[j].frequency,
        rebalanceThreshold: group[j].threshold,
        initialCapital: capital,
        cagr: stats.cagr,
        maxDrawdown: stats.maxDrawdown,
        sharpe: stats.sharpe,
        sortino: stats.sortino,
        stdev: stats.stdev,
        calmar: stats.calmar ?? 0,
      });
    }
  }

  return { items };
}

/** 按约束过滤结果 */
function filterByConstraints(
  items: OptimizeResultItem[],
  constraints?: OptimizeRequest['constraints'],
): OptimizeResultItem[] {
  if (!constraints) return items;
  return items.filter((it) => {
    if (constraints.maxDrawdown !== undefined && it.maxDrawdown > constraints.maxDrawdown / 100)
      return false;
    if (constraints.minCagr !== undefined && it.cagr < constraints.minCagr / 100) return false;
    return true;
  });
}

/** 计算目标函数值 */
function objectiveValue(it: OptimizeResultItem, objective: Objective): number {
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

/** 运行最优组合回测，获取增长曲线 */
function computeBestResult(
  bestItem: OptimizeResultItem,
  portfolio: OptimizeRequest['portfolio'],
  parameters: OptimizeRequest['parameters'],
  priceData: Record<string, Record<string, number>>,
): { best: BestResultItem; benchmarkGrowth: Array<{ date: string; value: number }> | null } {
  const bestPortfolios: Portfolio[] = [
    {
      id: 'best',
      name: '最优组合',
      assets: portfolio.assets.map((a) => ({ ticker: a.ticker, weight: a.weight })),
      rebalanceFrequency: bestItem.rebalanceFrequency,
      rebalanceThreshold: bestItem.rebalanceThreshold,
      rebalanceOffset: 0,
      drag: 0,
      totalReturn: true,
    },
  ];
  const bestResult = runPortfolioBacktest(
    bestPortfolios,
    priceData,
    buildBacktestParameters(parameters, bestItem.initialCapital),
  );
  return {
    best: { ...bestItem, growthCurve: bestResult.portfolios[0].growthCurve },
    benchmarkGrowth: bestResult.benchmarkGrowth || null,
  };
}

export async function executeOptimization(body: Record<string, unknown>): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  const startTime = Date.now();
  const req = body as unknown as OptimizeRequest;
  const { portfolio, parameterSpace, parameters, objective, constraints } = req;

  const validationError = validateOptimizeRequest(req);
  if (validationError) return { success: false, error: validationError };

  const allTickers = new Set<string>();
  for (const a of portfolio.assets) allTickers.add(a.ticker);
  if (parameters.benchmarkTicker) allTickers.add(parameters.benchmarkTicker);

  const priceData = await fetchHistoryData(
    Array.from(allTickers),
    parameters.startDate,
    parameters.endDate,
  );

  const invalidTickers: string[] = [];
  for (const t of allTickers) {
    if (!priceData[t] || Object.keys(priceData[t]).length === 0) {
      invalidTickers.push(t);
    }
  }
  if (invalidTickers.length > 0) {
    return { success: false, error: `以下标的代码无效：${invalidTickers.join(', ')}` };
  }

  const combos = buildCombinations(parameterSpace);
  if (combos.length === 0) {
    return { success: false, error: '参数空间为空，请检查范围与步长' };
  }
  if (combos.length > MAX_OPTIMIZER_COMBINATIONS) {
    return {
      success: false,
      error: `参数组合数 ${combos.length} 超过上限 ${MAX_OPTIMIZER_COMBINATIONS}，请缩小参数空间`,
    };
  }

  logger.info(`[backtest-optimizer] 开始优化：${combos.length} 个组合，目标=${objective}`);

  const { items } = runBacktestGroups(combos, portfolio, parameters, priceData);
  const filtered = filterByConstraints(items, constraints);
  filtered.sort((a, b) => objectiveValue(b, objective) - objectiveValue(a, objective));

  let best: BestResultItem | null = null;
  let benchmarkGrowth: Array<{ date: string; value: number }> | null = null;

  if (filtered.length > 0) {
    const result = computeBestResult(filtered[0], portfolio, parameters, priceData);
    best = result.best;
    benchmarkGrowth = result.benchmarkGrowth;
  }

  logger.info(
    `[backtest-optimizer] 优化完成：${combos.length} 组合，${filtered.length} 通过过滤，耗时 ${Date.now() - startTime}ms`,
  );

  return {
    success: true,
    data: {
      results: filtered,
      best,
      benchmarkGrowth,
      totalCombinations: combos.length,
    },
  };
}
