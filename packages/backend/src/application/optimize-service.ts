import type { Portfolio, BacktestResult, BacktestParameters } from '@backtest/shared/types';
import { z } from 'zod';
import { callEngineStrict } from '../utils/engineClient.js';
import {
  optimizeResultSchema,
  frontierResultSchema,
  backtestResultSchema,
} from '../schemas/engineSchemas.js';
import { buildEngineParams } from './backtest/backtestEngineUtils.js';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import {
  preparePriceDataAndWarnings,
  filterPriceData,
  translateDomainError,
  calculateDateRange,
  loadMacroData,
  type MacroData,
} from './backtest-helpers.js';
import type { Warning, DateRangeInfo } from './backtest-helpers.js';
import { logger } from '../utils/logger.js';
import {
  MAX_OPTIMIZER_COMBINATIONS,
  buildBacktestParameters,
  buildCombinations,
  filterByConstraints,
  objectiveValue,
  validateOptimizeRequest,
  type BestResultItem,
  type Combo,
  type BacktestOptimizerRequest as OptimizeRequest,
  type OptimizeResultItem,
} from '../domain/services/optimizer-domain.js';

const toEngineBody = (p: Portfolio): Record<string, unknown> =>
  translateDomainError(() => DomainPortfolio.fromDTO(p)).toEngineBody();

async function runCompute(
  path: string,
  tickers: string[],
  parameters: BacktestParameters,
  bodyExtra: Record<string, unknown>,
  schema: z.ZodType<unknown>,
): Promise<{ data: Record<string, unknown>; warnings: Warning[]; dateRange: DateRangeInfo }> {
  const { priceData, warnings, invalidTickers, allTickers } = await preparePriceDataAndWarnings(
    tickers,
    parameters.startDate,
    parameters.endDate,
  );
  const result = await callEngineStrict<Record<string, unknown>>(
    path,
    {
      tickers,
      priceData: filterPriceData(priceData, allTickers),
      ...bodyExtra,
    },
    schema,
  );
  const dateRange = calculateDateRange(
    parameters.startDate,
    parameters.endDate,
    priceData,
    invalidTickers,
  );
  return { data: result, warnings, dateRange };
}

export async function runOptimization(
  tickers: string[],
  objective: 'maxSharpe' | 'minVolatility' | 'maxReturn',
  constraints: { minWeight?: number; maxWeight?: number },
  parameters: BacktestParameters,
  numIterations?: number,
): Promise<{ data: Record<string, unknown>; warnings: Warning[]; dateRange: DateRangeInfo }> {
  return runCompute(
    '/api/engine/optimize',
    tickers,
    parameters,
    {
      objective,
      constraints: constraints || {},
      numIterations: numIterations ? Math.min(numIterations, 100000) : 10000,
    },
    optimizeResultSchema,
  );
}

export async function runEfficientFrontier(
  tickers: string[],
  parameters: BacktestParameters,
  numPoints?: number,
): Promise<{ data: Record<string, unknown>; warnings: Warning[]; dateRange: DateRangeInfo }> {
  return runCompute(
    '/api/engine/efficient-frontier',
    tickers,
    parameters,
    {
      numPoints: numPoints || 20,
    },
    frontierResultSchema,
  );
}

interface OptimizeItemResult extends OptimizeResultItem {
  growthCurve: Array<{ date: string; value: number }>;
  benchmarkGrowth: Array<{ date: string; value: number }> | null;
}

async function runBacktestGroups(
  combos: Combo[],
  portfolio: OptimizeRequest['portfolio'],
  parameters: OptimizeRequest['parameters'],
  priceData: Record<string, Record<string, number>>,
  macro: MacroData,
): Promise<{ items: OptimizeItemResult[] }> {
  const items: OptimizeItemResult[] = [];
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
    const btResult = await callEngineStrict<BacktestResult>(
      '/api/engine/backtest',
      {
        portfolios: portfolios.map(toEngineBody),
        priceData,
        ...macro,
        params: buildEngineParams(buildBacktestParameters(parameters, capital)),
      },
      backtestResultSchema,
    );
    const benchmarkGrowth = btResult.benchmarkGrowth ?? null;
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
        // 组回测已含 growthCurve/benchmarkGrowth，best 不再重跑（同一入参，结果一致）
        growthCurve: btResult.portfolios[j].growthCurve,
        benchmarkGrowth,
      });
    }
  }
  return { items };
}

export async function executeOptimization(body: Record<string, unknown>): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  warnings?: Warning[];
  dateRange?: DateRangeInfo;
  error?: string;
}> {
  const startTime = Date.now();
  const req = body as unknown as OptimizeRequest;
  const { portfolio, parameterSpace, parameters, objective, constraints } = req;
  const validationError = validateOptimizeRequest(req);
  if (validationError) return { success: false, error: validationError };
  const allTickers = new Set(portfolio.assets.map((a) => a.ticker));
  if (parameters.benchmarkTicker) allTickers.add(parameters.benchmarkTicker);
  const { priceData, warnings, invalidTickers } = await preparePriceDataAndWarnings(
    Array.from(allTickers),
    parameters.startDate,
    parameters.endDate,
  );
  if (invalidTickers.length > 0)
    return { success: false, error: `以下标的代码无效：${invalidTickers.join(', ')}` };
  const macro = await loadMacroData(parameters);
  const combos = buildCombinations(parameterSpace);
  if (combos.length === 0) return { success: false, error: '参数空间为空，请检查范围与步长' };
  if (combos.length > MAX_OPTIMIZER_COMBINATIONS)
    return {
      success: false,
      error: `参数组合数 ${combos.length} 超过上限 ${MAX_OPTIMIZER_COMBINATIONS}，请缩小参数空间`,
    };
  logger.info(`[backtest-optimizer] 开始优化：${combos.length} 个组合，目标=${objective}`);
  const { items } = await runBacktestGroups(combos, portfolio, parameters, priceData, macro);
  const filtered = filterByConstraints(items, constraints);
  filtered.sort((a, b) => objectiveValue(b, objective) - objectiveValue(a, objective));
  let computed: {
    best: BestResultItem;
    benchmarkGrowth: OptimizeItemResult['benchmarkGrowth'];
  } | null = null;
  if (filtered.length > 0) {
    const { benchmarkGrowth, ...rest } = filtered[0] as OptimizeItemResult;
    computed = { best: rest, benchmarkGrowth };
  }
  logger.info(
    `[backtest-optimizer] 优化完成：${combos.length} 组合，${filtered.length} 通过过滤，耗时 ${Date.now() - startTime}ms`,
  );
  const dateRange = calculateDateRange(parameters.startDate, parameters.endDate, priceData);
  return {
    success: true,
    data: {
      results: filtered,
      best: computed?.best ?? null,
      benchmarkGrowth: computed?.benchmarkGrowth ?? null,
      totalCombinations: combos.length,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
    dateRange,
  };
}
