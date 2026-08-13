import pLimit from 'p-limit';
import { callEngineStrict } from '../utils/engineClient.js';
import { monteCarloResultSchema } from '../schemas/engineSchemas.js';
import { buildEngineParams } from './backtest/backtestEngineUtils.js';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import {
  collectDomainTickers,
  preparePriceDataAndWarnings,
  filterPriceData,
  loadMacroData,
  sanitizeMcParams,
  translateDomainError,
  calculateDateRange,
  clampParametersToDataRange,
} from './backtest-helpers.js';
import type { Portfolio, BacktestParameters } from '@backtest/shared/types';
import type { Warning, DateRangeInfo } from './backtest-helpers.js';

const ENGINE_CONCURRENCY_LIMIT = 10;

// @throws {EngineUnavailableError}
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
  const { priceData, warnings, invalidTickers, effectiveStartDate, effectiveEndDate } =
    await preparePriceDataAndWarnings(tickers, parameters.startDate, parameters.endDate);

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
        callEngineStrict(
          '/api/engine/monte-carlo',
          {
            portfolio: dp.toEngineBody(),
            priceData: filterPriceData(priceData, allTickers),
            params: buildEngineParams(effectiveParameters),
            cpiData,
            exchangeRates,
            mcParams: sanitizedMcParams,
          },
          monteCarloResultSchema,
        ),
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
