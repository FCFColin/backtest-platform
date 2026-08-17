import { trace } from '@opentelemetry/api';
import { callEngineStrict } from '../utils/engineClient.js';
import { backtestResultSchema } from '../schemas/engineSchemas.js';
import { buildEngineParams } from './backtest/backtestEngineUtils.js';
import { logger } from '../utils/logger.js';
import { recordBacktestRequest } from '../utils/metrics.js';
import { withTimeout } from '../utils/misc.js';
import { config } from '../config/index.js';
import {
  compressBacktestResultForSync,
  backtestCacheKey,
  setBacktestResultCache,
} from './backtest/backtestResultUtils.js';
import type { Portfolio, BacktestParameters, BacktestResult } from '@backtest/shared';
import type { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import {
  prepareBacktestContext,
  portfolioToDomain,
  collectDomainTickers,
  filterPriceData,
  calculateDateRange,
  type BacktestExecutionParams,
  type Warning,
  type DateRangeInfo,
} from './backtest-helpers.js';

const tracer = trace.getTracer('backtest-platform', '1.0.0');

/** @throws {ValidationError} 日期/标的非法; @throws {EngineUnavailableError} ADR-008 */
export async function runPortfolioBacktest(opts: {
  portfolios: Portfolio[];
  parameters: BacktestParameters;
  tenantId?: string;
  onProgress?: (pct: number) => void;
}): Promise<{ result: unknown; warnings: Warning[]; dateRange: DateRangeInfo }> {
  const { portfolios, parameters, tenantId, onProgress } = opts;
  onProgress?.(5);
  const ctx = await prepareBacktestContext(portfolios, parameters);
  onProgress?.(30);
  const { result } = await withTimeout(
    runBacktest(
      {
        portfolios,
        parameters: ctx.effectiveParameters,
        priceData: ctx.priceData,
        cpiData: ctx.cpiData,
        exchangeRates: ctx.exchangeRates,
      },
      ctx.domainPortfolios,
    ),
    config.BACKTEST_SYNC_TIMEOUT_MS,
    'portfolio-backtest',
  );
  onProgress?.(90);
  const cacheKey = backtestCacheKey(portfolios, ctx.effectiveParameters, tenantId);
  void setBacktestResultCache(cacheKey, result).catch((err) =>
    logger.error({ err, cacheKey }, '[backtest-service] Failed to set backtest result cache'),
  );
  onProgress?.(100);
  const dateRange = calculateDateRange(
    parameters.startDate,
    parameters.endDate,
    ctx.effectiveStartDate,
    ctx.effectiveEndDate,
    ctx.invalidTickers,
  );
  return { result: compressBacktestResultForSync(result), warnings: ctx.warnings, dateRange };
}

/** @throws {EngineUnavailableError} ADR-008 */
export async function runBacktest(
  params: BacktestExecutionParams,
  preBuiltDomainPortfolios?: DomainPortfolio[],
): Promise<{ result: BacktestResult }> {
  const { portfolios, parameters, priceData, cpiData, exchangeRates } = params;
  const domainPortfolios = preBuiltDomainPortfolios ?? portfolios.map(portfolioToDomain);
  return tracer.startActiveSpan('BacktestApplicationService.runBacktest', async (span) => {
    try {
      const allTickers = collectDomainTickers(domainPortfolios, parameters.benchmarkTicker);
      span.setAttribute('portfolio_count', portfolios.length);
      span.setAttribute('ticker_count', allTickers.size);
      logger.info(
        {
          portfolioCount: portfolios.length,
          startDate: parameters.startDate,
          endDate: parameters.endDate,
        },
        'Starting backtest',
      );
      const filteredPriceData = filterPriceData(priceData, allTickers);
      span.setAttribute('cache_hit', Object.keys(filteredPriceData).length === allTickers.size);
      const result = await callEngineStrict<BacktestResult>(
        '/api/engine/backtest',
        {
          portfolios: domainPortfolios.map((p) => p.toEngineBody()),
          priceData: filteredPriceData,
          params: buildEngineParams(parameters),
          cpiData,
          exchangeRates,
        },
        backtestResultSchema,
      );
      logger.info('Backtest completed');
      recordBacktestRequest('portfolio', 'sync', 'success');
      return { result };
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
