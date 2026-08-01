import pLimit from 'p-limit';
import { callEngineStrict } from '../utils/engineClient.js';
import { buildEngineParams } from './backtest/backtestEngineUtils.js';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import {
  collectDomainTickers,
  fetchPriceDataWithRange,
  filterPriceData,
  loadMacroData,
  sanitizeMcParams,
  translateDomainError,
  collectInvalidTickerWarnings,
  calculateDateRange,
  pushDegradedWarning,
  clampParametersToDataRange,
} from './backtest-helpers.js';
import type { Portfolio, BacktestParameters } from '@backtest/shared/types';
import type { Warning, DateRangeInfo } from './backtest-helpers.js';

/** 引擎调用并发上限（D3-004：防止大量组合同时调用引擎导致过载） */
const ENGINE_CONCURRENCY_LIMIT = 10;

/**
 * 运行蒙特卡洛模拟。
 *
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function runMonteCarlo(
  portfolioList: Portfolio[],
  parameters: BacktestParameters,
  mcParams?: Record<string, unknown>,
): Promise<{ data: unknown; warnings: Warning[]; dateRange: DateRangeInfo }> {
  const domainPortfolios = portfolioList.map((p) =>
    translateDomainError(() => DomainPortfolio.fromDTO(p)),
  );
  const allTickers = collectDomainTickers(domainPortfolios, '');
  const tickers = Array.from(allTickers);
  const warnings: Warning[] = [];

  const { priceData, effectiveStartDate, effectiveEndDate, degraded, degradedWarning } =
    await fetchPriceDataWithRange(tickers, parameters.startDate, parameters.endDate);

  const invalidTickers = collectInvalidTickerWarnings(allTickers, priceData, warnings);

  pushDegradedWarning(warnings, degraded, degradedWarning);

  const sanitizedMcParams = sanitizeMcParams(mcParams);
  const { cpiData, exchangeRates } = await loadMacroData(parameters);

  const effectiveParameters = clampParametersToDataRange(
    parameters,
    effectiveStartDate,
    effectiveEndDate,
  );

  const limit = pLimit(ENGINE_CONCURRENCY_LIMIT);
  const results = await Promise.all(
    domainPortfolios.map((dp) =>
      limit(() =>
        callEngineStrict('/api/engine/monte-carlo', {
          portfolio: dp.toEngineBody(),
          priceData: filterPriceData(priceData, allTickers),
          params: buildEngineParams(effectiveParameters),
          cpiData,
          exchangeRates,
          mcParams: sanitizedMcParams,
        }),
      ),
    ),
  );

  const data = portfolioList.length === 1 ? results[0] : results;

  const dateRange = calculateDateRange(
    parameters.startDate,
    parameters.endDate,
    priceData,
    invalidTickers.length > 0 ? invalidTickers : undefined,
  );

  return { data, warnings, dateRange };
}
