/**
 * 优化应用服务（统一函数导出）。
 *
 * 合并了原 optimize-service.ts（组合优化/有效前沿）与 optimizer-application-service.ts（回测优化器参数搜索）。
 * 所有计算逻辑已迁移到 Go 引擎（ADR-031），此服务仅负责数据获取编排与引擎调用。
 *
 * 纯领域逻辑（参数组合生成、约束过滤、目标函数等）在 domain/optimizer-domain.ts 中。
 */
import type { Portfolio, BacktestResult, BacktestParameters } from '@backtest/shared/types';
import { callEngineStrict } from '../utils/engineClient.js';
import { buildEngineParams } from './backtest/engineBodyBuilder.js';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import {
  fetchPriceData,
  filterPriceData,
  translateDomainError,
  collectInvalidTickerWarnings,
  calculateDateRange,
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

// ---------------------------------------------------------------------------
// 组合优化 / 有效前沿
// ---------------------------------------------------------------------------

/**
 * 运行组合优化。
 *
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function runOptimization(
  tickers: string[],
  objective: 'maxSharpe' | 'minVolatility' | 'maxReturn',
  constraints: { minWeight?: number; maxWeight?: number },
  parameters: BacktestParameters,
  numIterations?: number,
): Promise<{ data: Record<string, unknown>; warnings: Warning[]; dateRange: DateRangeInfo }> {
  const cappedIterations = numIterations ? Math.min(numIterations, 100000) : 10000;
  const warnings: Warning[] = [];

  const {
    data: priceData,
    degraded,
    degradedWarning,
  } = await fetchPriceData(tickers, parameters.startDate, parameters.endDate);
  const allTickers = new Set(tickers);
  const invalidTickers = collectInvalidTickerWarnings(allTickers, priceData, warnings);

  if (degraded) {
    warnings.push({
      code: 'DATA_DEGRADED',
      message: degradedWarning || '数据服务降级，部分数据可能缺失',
    });
  }

  const result = await callEngineStrict<Record<string, unknown>>('/api/engine/optimize', {
    tickers,
    priceData: filterPriceData(priceData, allTickers),
    objective,
    constraints: constraints || {},
    numIterations: cappedIterations,
  });

  const engineResp = result as { data?: Record<string, unknown> };
  const data = engineResp?.data ?? result;
  const dateRange = calculateDateRange(
    parameters.startDate,
    parameters.endDate,
    priceData,
    invalidTickers,
  );

  return { data, warnings, dateRange };
}

/**
 * 计算有效前沿。
 *
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function runEfficientFrontier(
  tickers: string[],
  parameters: BacktestParameters,
  numPoints?: number,
  riskFreeRate?: number,
): Promise<{ data: Record<string, unknown>; warnings: Warning[]; dateRange: DateRangeInfo }> {
  const warnings: Warning[] = [];

  const {
    data: priceData,
    degraded,
    degradedWarning,
  } = await fetchPriceData(tickers, parameters.startDate, parameters.endDate);
  const allTickers = new Set(tickers);
  const invalidTickers = collectInvalidTickerWarnings(allTickers, priceData, warnings);

  if (degraded) {
    warnings.push({
      code: 'DATA_DEGRADED',
      message: degradedWarning || '数据服务降级，部分数据可能缺失',
    });
  }

  const result = await callEngineStrict<Record<string, unknown>>('/api/engine/efficient-frontier', {
    tickers,
    priceData: filterPriceData(priceData, allTickers),
    numPoints: numPoints || 20,
    riskFreeRate: riskFreeRate || 0.02,
  });

  const engineResp = result as { data?: Record<string, unknown> };
  const data = engineResp?.data ?? result;
  const dateRange = calculateDateRange(
    parameters.startDate,
    parameters.endDate,
    priceData,
    invalidTickers,
  );

  return { data, warnings, dateRange };
}

// ---------------------------------------------------------------------------
// 回测优化器（参数空间搜索）
// ---------------------------------------------------------------------------

/** 按资金分组运行回测，收集结果项（经 Go 引擎，ADR-031 fail-closed） */
async function runBacktestGroups(
  combos: Combo[],
  portfolio: OptimizeRequest['portfolio'],
  parameters: OptimizeRequest['parameters'],
  priceData: Record<string, Record<string, number>>,
): Promise<{ items: OptimizeResultItem[] }> {
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
    const btResult = await callEngineStrict<BacktestResult>('/api/engine/backtest', {
      portfolios: portfolios.map((p) =>
        translateDomainError(() => DomainPortfolio.fromDTO(p)).toEngineBody(),
      ),
      priceData,
      params: buildEngineParams(btParams),
    });

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

/** 运行最优组合回测，获取增长曲线（经 Go 引擎，ADR-031 fail-closed） */
async function computeBestResult(
  bestItem: OptimizeResultItem,
  portfolio: OptimizeRequest['portfolio'],
  parameters: OptimizeRequest['parameters'],
  priceData: Record<string, Record<string, number>>,
): Promise<{
  best: BestResultItem;
  benchmarkGrowth: Array<{ date: string; value: number }> | null;
}> {
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
  const bestResult = await callEngineStrict<BacktestResult>('/api/engine/backtest', {
    portfolios: bestPortfolios.map((p) =>
      translateDomainError(() => DomainPortfolio.fromDTO(p)).toEngineBody(),
    ),
    priceData,
    params: buildEngineParams(buildBacktestParameters(parameters, bestItem.initialCapital)),
  });
  return {
    best: { ...bestItem, growthCurve: bestResult.portfolios[0].growthCurve },
    benchmarkGrowth: bestResult.benchmarkGrowth || null,
  };
}

/**
 * 运行回测优化器参数搜索。
 *
 * @returns 成功时 { success: true, data, warnings?, dateRange? }；校验失败时 { success: false, error }
 */
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

  const allTickers = new Set<string>();
  for (const a of portfolio.assets) allTickers.add(a.ticker);
  if (parameters.benchmarkTicker) allTickers.add(parameters.benchmarkTicker);

  const warnings: Warning[] = [];
  const {
    data: priceData,
    degraded,
    degradedWarning,
  } = await fetchPriceData(Array.from(allTickers), parameters.startDate, parameters.endDate);

  const invalidTickers: string[] = Array.from(allTickers).filter(
    (t) => !priceData[t] || Object.keys(priceData[t]).length === 0,
  );
  if (invalidTickers.length > 0) {
    return { success: false, error: `以下标的代码无效：${invalidTickers.join(', ')}` };
  }

  if (degraded) {
    warnings.push({
      code: 'DATA_DEGRADED',
      message: degradedWarning || '数据服务降级，部分数据可能缺失',
    });
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

  const { items } = await runBacktestGroups(combos, portfolio, parameters, priceData);
  const filtered = filterByConstraints(items, constraints);
  filtered.sort((a, b) => objectiveValue(b, objective) - objectiveValue(a, objective));

  let best: BestResultItem | null = null;
  let benchmarkGrowth: Array<{ date: string; value: number }> | null = null;

  if (filtered.length > 0) {
    const result = await computeBestResult(filtered[0], portfolio, parameters, priceData);
    best = result.best;
    benchmarkGrowth = result.benchmarkGrowth;
  }

  logger.info(
    `[backtest-optimizer] 优化完成：${combos.length} 组合，${filtered.length} 通过过滤，耗时 ${Date.now() - startTime}ms`,
  );

  const dateRange = calculateDateRange(parameters.startDate, parameters.endDate, priceData);

  return {
    success: true,
    data: {
      results: filtered,
      best,
      benchmarkGrowth,
      totalCombinations: combos.length,
    },
    warnings: warnings.length > 0 ? warnings : undefined,
    dateRange,
  };
}
