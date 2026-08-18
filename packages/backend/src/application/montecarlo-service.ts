import pLimit from 'p-limit';
import { callEngineStrict } from '../utils/engineClient.js';
import { monteCarloResultSchema } from '../schemas/engineSchemas.js';
import { buildEngineParams } from './backtest/backtestEngineUtils.js';
import { prepareBacktestContext, filterPriceData, sanitizeMcParams } from './backtest-helpers.js';
import type { Portfolio, BacktestParameters } from '@backtest/shared/types';
import type { Warning, DateRangeInfo } from './backtest-helpers.js';

const ENGINE_CONCURRENCY_LIMIT = 10;

// @throws {EngineUnavailableError}
export async function runMonteCarlo(
  portfolioList: Portfolio[],
  parameters: BacktestParameters,
  mcParams?: Record<string, unknown>,
): Promise<{ data: unknown; warnings: Warning[]; dateRange: DateRangeInfo }> {
  const ctx = await prepareBacktestContext(portfolioList, parameters);

  const limit = pLimit(ENGINE_CONCURRENCY_LIMIT);
  const results = await Promise.all(
    ctx.domainPortfolios.map((dp) =>
      limit(() =>
        callEngineStrict(
          '/api/engine/monte-carlo',
          {
            portfolio: dp.toEngineBody(),
            priceData: filterPriceData(ctx.priceData, ctx.allTickers),
            params: buildEngineParams(ctx.effectiveParameters),
            cpiData: ctx.cpiData,
            exchangeRates: ctx.exchangeRates,
            mcParams: sanitizeMcParams(mcParams),
          },
          monteCarloResultSchema,
        ),
      ),
    ),
  );

  const data = portfolioList.length === 1 ? results[0] : results;

  return { data, warnings: ctx.warnings, dateRange: ctx.dateRange };
}
