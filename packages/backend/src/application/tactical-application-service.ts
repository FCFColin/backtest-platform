// ADR-008: 计算逻辑在 Go 引擎 /api/engine/tactical-backtest
import type { TacticalStrategy } from '@backtest/shared/types/tactical';
import type { PortfolioResult, RebalanceFrequency } from '@backtest/shared/types/index';
import type { TacticalBacktestRequest } from '../schemas/tactical.js';
import { fetchHistoryData } from '../infrastructure/dataFacade.js';
import { callEngineStrict } from '../utils/engineClient.js';
import { backtestResultSchema, tacticalBacktestResultSchema } from '../schemas/engineSchemas.js';
import { buildEngineParams } from './backtest/backtestEngineUtils.js';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import { Ticker, Weight } from '../domain/value-objects/index.js';
import { createEmptyStatistics } from '@backtest/shared/types';
import { logger } from '../utils/logger.js';
import {
  ensurePriceDataExists,
  ensureSufficientTradingDays,
} from './backtest/backtestEngineUtils.js';
import { translateDomainError, type DegradedResult } from './backtest-helpers.js';
import { toDateStr, todayStr } from '../utils/misc.js';

interface SignalHistoryEntry {
  date: string;
  activeSignals: string[];
  weights: Array<{ ticker: string; weight: number }>;
}

interface TacticalBacktestResult {
  portfolio: PortfolioResult;
  benchmark: PortfolioResult;
  signalHistory: SignalHistoryEntry[];
}

export function collectTickers(strategy: TacticalStrategy): string[] {
  return Array.from(new Set(strategy.signals.flatMap((s) => s.targetWeights.map((w) => w.ticker))));
}

interface BenchmarkParams {
  allTickers: string[];
  startDate: string;
  endDate: string;
  startingValue: number;
  rebalanceFrequency: RebalanceFrequency;
  priceData: Record<string, Record<string, number>>;
}

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
      backtestResultSchema,
    );
    return engineResp.portfolios[0];
  } catch (err) {
    logger.warn(`[tactical] 基准回测失败，使用空结果: ${(err as Error).message}`);
    return createEmptyPortfolioResult();
  }
}

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

// @throws ValidationError 无效标的或交易日不足
async function prepareTacticalPriceData(
  allTickers: string[],
  startDate: string,
  endDate: string,
): Promise<
  { priceData: Record<string, Record<string, number>>; dates: string[] } & {
    degraded: boolean;
    degradedWarning?: string;
  }
> {
  const {
    data: priceData,
    degraded,
    degradedWarning,
  } = await fetchHistoryData(allTickers, startDate, endDate);
  ensurePriceDataExists(allTickers, priceData, 'tactical');

  const dateSet = new Set(allTickers.flatMap((ticker) => Object.keys(priceData[ticker])));
  const dates = Array.from(dateSet)
    .sort()
    .filter((d) => d >= startDate && d <= endDate);
  ensureSufficientTradingDays(dates, 2, 'tactical');

  return { priceData, dates, degraded, degradedWarning };
}

// @throws ValidationError {EngineUnavailableError}
export async function executeTacticalBacktest(
  req: TacticalBacktestRequest,
): Promise<DegradedResult<TacticalBacktestResult>> {
  const { strategy, startDate, endDate, startingValue, rebalanceFrequency } = req;
  const allTickers = collectTickers(strategy);

  const { priceData, dates, degraded, degradedWarning } = await prepareTacticalPriceData(
    allTickers,
    startDate,
    endDate,
  );

  const tacticalResult = await callEngineStrict<{
    portfolio: PortfolioResult;
    signalHistory: TacticalBacktestResult['signalHistory'];
  }>(
    '/api/engine/tactical-backtest',
    {
      strategy,
      priceData,
      dates,
      startingValue,
      rebalanceFrequency,
    },
    tacticalBacktestResultSchema,
  );

  const benchmarkResult = await runBenchmarkBacktest({
    allTickers,
    startDate,
    endDate,
    startingValue,
    rebalanceFrequency,
    priceData,
  });

  return {
    data: {
      portfolio: tacticalResult.portfolio,
      benchmark: benchmarkResult,
      signalHistory: tacticalResult.signalHistory,
    },
    degraded,
    degradedWarning,
  };
}

// @throws {EngineUnavailableError}
export async function executeTacticalWhatIf(
  tickers: string[],
  strategy: TacticalStrategy,
): Promise<DegradedResult<Array<{ ticker: string; weight: number; signals: string[] }>>> {
  const end = todayStr();
  const startDate = toDateStr(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000));

  const {
    data: priceData,
    degraded,
    degradedWarning,
  } = await fetchHistoryData(tickers, startDate, end);
  ensurePriceDataExists(tickers, priceData, 'tactical-whatif');

  const result = await callEngineStrict<{ signalHistory: SignalHistoryEntry[] }>(
    '/api/engine/tactical-backtest',
    {
      strategy,
      priceData,
      dates: Object.keys(priceData[tickers[0]] || {})
        .sort()
        .slice(-60),
      startingValue: 10000,
      rebalanceFrequency: 'monthly' as RebalanceFrequency,
    },
    tacticalBacktestResultSchema,
  );

  const lastEntry = result.signalHistory[result.signalHistory.length - 1];
  const data = lastEntry
    ? tickers.map((ticker) => {
        const w = lastEntry.weights.find((wt) => wt.ticker === ticker);
        return { ticker, weight: w?.weight ?? 0, signals: lastEntry.activeSignals };
      })
    : [];
  return { data, degraded, degradedWarning };
}
