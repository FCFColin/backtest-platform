/**
 * 战术分配回测应用服务（T-30 / CQRS Command）
 *
 * 计算逻辑已迁移到 Go 引擎 /api/engine/tactical-backtest（ADR-031）。
 */
import type { TacticalStrategy, EmailAlertConfig } from '@backtest/shared/types/tactical';
import type { PortfolioResult, RebalanceFrequency } from '@backtest/shared/types/index';
import type { TacticalBacktestRequest } from '../schemas/tactical.js';
import { fetchHistoryData } from '../infrastructure/dataFacade.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { buildEngineParams } from './backtest/engineBodyBuilder.js';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import { Ticker } from '../domain/value-objects/ticker.js';
import { Weight } from '../domain/value-objects/weight.js';
import { createEmptyStatistics } from '@backtest/shared/types';
import { logger } from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';
import { ensurePriceDataExists, ensureSufficientTradingDays } from './backtest/priceDataUtils.js';
import { translateDomainError } from './backtest-helpers.js';

interface TacticalBacktestResult {
  portfolio: PortfolioResult;
  benchmark: PortfolioResult;
  signalHistory: Array<{
    date: string;
    activeSignals: string[];
    weights: Array<{ ticker: string; weight: number }>;
  }>;
}

/** 从策略中收集所有涉及的 ticker */
export function collectTickers(strategy: TacticalStrategy): string[] {
  const set = new Set<string>();
  for (const signal of strategy.signals) {
    for (const w of signal.targetWeights) set.add(w.ticker);
  }
  return Array.from(set);
}

interface BenchmarkParams {
  allTickers: string[];
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: RebalanceFrequency;
  priceData: Record<string, Record<string, number>>;
}

/**
 * 构造等权基准组合并调用引擎回测。
 * 失败时返回空结果，不阻断主流程。
 */
async function runBenchmarkBacktest(params: BenchmarkParams): Promise<PortfolioResult> {
  const { allTickers, startDate, endDate, startingValue, rebalanceFrequency, priceData } = params;
  const benchmarkPortfolio = translateDomainError(() =>
    DomainPortfolio.create(
      'tactical-benchmark',
      '等权基准',
      allTickers.map((t) => ({
        ticker: Ticker.create(t),
        weight: Weight.create(100 / allTickers.length),
      })),
      { rebalanceFrequency },
    ),
  );
  const benchmarkParams = {
    startDate,
    endDate,
    startingValue,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: '',
    cashflowLegs: [],
    oneTimeCashflows: [],
  };

  try {
    const engineResp = await callEngineStrict<{ portfolios: PortfolioResult[] }>(
      '/api/engine/backtest',
      {
        portfolios: [benchmarkPortfolio.toEngineBody()],
        priceData,
        params: buildEngineParams(benchmarkParams),
      },
    );
    return engineResp.portfolios[0];
  } catch (err) {
    logger.warn(`[tactical] 基准回测失败，使用空结果: ${(err as Error).message}`);
    return createEmptyPortfolioResult();
  }
}

/** 返回全零统计的空回测结果，用于基准回测失败时的降级。 */
function createEmptyPortfolioResult(): PortfolioResult {
  return {
    name: '等权基准',
    growthCurve: [],
    drawdownCurve: [],
    rollingReturns: [],
    annualReturns: [],
    monthlyReturns: [],
    statistics: createEmptyStatistics(),
  } satisfies PortfolioResult;
}

/**
 * 获取并校验战术回测所需的价格数据，返回排序后的交易日列表。
 *
 * @throws ValidationError 无效标的或交易日不足
 */
async function prepareTacticalPriceData(
  allTickers: string[],
  startDate: string,
  endDate: string,
): Promise<{ priceData: Record<string, Record<string, number>>; dates: string[] }> {
  const { data: priceData } = await fetchHistoryData(allTickers, startDate, endDate);
  ensurePriceDataExists(allTickers, priceData, 'tactical');

  const dateSet = new Set<string>();
  for (const ticker of allTickers) {
    for (const date of Object.keys(priceData[ticker])) dateSet.add(date);
  }
  const dates = Array.from(dateSet)
    .sort()
    .filter((d) => d >= startDate && d <= endDate);
  ensureSufficientTradingDays(dates, 2, 'tactical');

  return { priceData, dates };
}

/**
 * 运行战术分配回测（含数据获取 + 等权基准）。
 *
 * @throws ValidationError 无效标的或交易日不足
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function executeTacticalBacktest(
  req: TacticalBacktestRequest,
): Promise<TacticalBacktestResult> {
  const { strategy, startDate, endDate, startingValue, rebalanceFrequency } = req;
  const allTickers = collectTickers(strategy);

  const { priceData, dates } = await prepareTacticalPriceData(allTickers, startDate, endDate);

  const tacticalResult = await callEngineStrict<{
    portfolio: PortfolioResult;
    signalHistory: TacticalBacktestResult['signalHistory'];
  }>('/api/engine/tactical-backtest', {
    strategy,
    priceData,
    dates,
    startingValue,
    rebalanceFrequency,
  });

  const benchmarkResult = await runBenchmarkBacktest({
    allTickers,
    startDate,
    endDate,
    startingValue,
    rebalanceFrequency,
    priceData,
  });

  return {
    portfolio: tacticalResult.portfolio,
    benchmark: benchmarkResult,
    signalHistory: tacticalResult.signalHistory,
  };
}

/**
 * 校验并接受战术告警配置。
 */
export function saveTacticalAlertConfig(config: EmailAlertConfig): EmailAlertConfig {
  if (config.enabled && !config.email) {
    throw new ValidationError('启用告警时必须填写邮箱');
  }
  return config;
}

/**
 * 运行战术分配 what-if 查询：获取最近信号状态（含数据获取）。
 *
 * @param tickers - 标的代码列表
 * @param strategy - 战术策略配置
 * @returns 信号状态与权重列表
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function executeTacticalWhatIf(
  tickers: string[],
  strategy: TacticalStrategy,
): Promise<Array<{ ticker: string; weight: number; signals: string[] }>> {
  const end = new Date().toISOString().substring(0, 10);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  const startDate = start.toISOString().substring(0, 10);

  const { data: priceData } = await fetchHistoryData(tickers, startDate, end);
  ensurePriceDataExists(tickers, priceData, 'tactical-whatif');

  const result = await callEngineStrict<{
    signalHistory: Array<{
      date: string;
      activeSignals: string[];
      weights: Array<{ ticker: string; weight: number }>;
    }>;
  }>('/api/engine/tactical-backtest', {
    strategy,
    priceData,
    dates: Object.keys(priceData[tickers[0]] || {})
      .sort()
      .slice(-60),
    startingValue: 10000,
    rebalanceFrequency: 'monthly' as RebalanceFrequency,
  });

  const lastEntry = result.signalHistory[result.signalHistory.length - 1];
  if (!lastEntry) return [];

  return tickers.map((ticker) => {
    const w = lastEntry.weights.find((wt) => wt.ticker === ticker);
    return {
      ticker,
      weight: w?.weight ?? 0,
      signals: lastEntry.activeSignals,
    };
  });
}
