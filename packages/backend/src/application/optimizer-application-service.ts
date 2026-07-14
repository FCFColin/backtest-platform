/**
 * 回测优化器应用服务（T-30 / CQRS Command，RO-054 拆分后编排入口）
 *
 * 仅保留编排逻辑：数据获取 → 引擎调用 → 结果聚合。纯领域逻辑（参数组合生成、
 * 约束过滤、目标函数等）已抽离到 domain/optimizer-domain.ts，schema 定义在
 * schemas/optimizer.ts。
 *
 * 企业理由（ADR-013 DDD 分层）：编排层与领域层分离后，编排层只关心 I/O 顺序，
 * 领域规则变更不需要触碰此文件；领域函数可独立单元测试。
 */
import type { Portfolio, BacktestResult } from '@backtest/shared/types';
import { callEngineStrict } from '../utils/engineClient.js';
import { buildEnginePortfolioBody, buildEngineParams } from '../utils/engineBodyBuilder.js';
import { fetchHistoryData } from '../services/dataService.js';
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
} from '../domain/optimizer-domain.js';

export { MAX_OPTIMIZER_COMBINATIONS };

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
      portfolios: portfolios.map(buildEnginePortfolioBody),
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
    portfolios: bestPortfolios.map(buildEnginePortfolioBody),
    priceData,
    params: buildEngineParams(buildBacktestParameters(parameters, bestItem.initialCapital)),
  });
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
