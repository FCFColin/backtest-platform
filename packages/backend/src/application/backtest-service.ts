import { trace } from '@opentelemetry/api';
import { callEngineStrict } from '../utils/engineClient.js';
import { backtestResultSchema } from '../schemas/engineSchemas.js';
import { buildEngineParams } from './backtest/backtestEngineUtils.js';
import { logger } from '../utils/logger.js';
import { recordBacktestRequest } from '../utils/metrics.js';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import { withTimeout } from '../utils/misc.js';
import { config } from '../config/index.js';
import {
  compressBacktestResultForSync,
  backtestCacheKey,
  setBacktestResultCache,
} from './backtest/backtestResultUtils.js';
import type {
  BacktestExecutionParams,
  BacktestExecutionResult,
  Warning,
  DateRangeInfo,
} from './backtest-helpers.js';
import type { Portfolio, BacktestParameters, BacktestResult } from '@backtest/shared';
import {
  preparePortfolioBacktest,
  collectInvalidTickerWarnings,
  fetchPriceDataWithRange,
  loadMacroData,
  translateDomainError,
  collectDomainTickers,
  filterPriceData,
  calculateDateRange,
  pushDegradedWarning,
  clampParametersToDataRange,
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
  const { allTickers, warnings } = preparePortfolioBacktest(portfolios, parameters);
  onProgress?.(10);
  const [
    { priceData, effectiveStartDate, effectiveEndDate, degraded, degradedWarning },
    { cpiData, exchangeRates },
  ] = await Promise.all([
    fetchPriceDataWithRange(Array.from(allTickers), parameters.startDate, parameters.endDate),
    loadMacroData(parameters),
  ]);
  onProgress?.(30);
  const invalidTickers = collectInvalidTickerWarnings(allTickers, priceData, warnings);
  pushDegradedWarning(warnings, degraded, degradedWarning);
  onProgress?.(35);
  const effectiveParameters = clampParametersToDataRange(
    parameters,
    effectiveStartDate,
    effectiveEndDate,
  );
  const { result } = await withTimeout(
    runBacktest({
      portfolios,
      parameters: effectiveParameters,
      priceData,
      cpiData,
      exchangeRates,
    }),
    config.BACKTEST_SYNC_TIMEOUT_MS,
    'portfolio-backtest',
  );
  onProgress?.(90);
  const cacheKey = backtestCacheKey(portfolios, parameters, tenantId);
  void setBacktestResultCache(cacheKey, result).catch((err) =>
    logger.error({ err, cacheKey }, '[backtest-service] Failed to set backtest result cache'),
  );
  onProgress?.(100);
  const dateRange = calculateDateRange(
    parameters.startDate,
    parameters.endDate,
    priceData,
    invalidTickers,
  );
  return { result: compressBacktestResultForSync(result), warnings, dateRange };
}

/** @throws {EngineUnavailableError} ADR-008 */
export async function runBacktest(
  params: BacktestExecutionParams,
): Promise<BacktestExecutionResult> {
  const { portfolios, parameters, priceData, cpiData, exchangeRates } = params;
  const domainPortfolios = portfolios.map((p) =>
    translateDomainError(() => DomainPortfolio.fromDTO(p)),
  );
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
      const engineBody = {
        portfolios: domainPortfolios.map((p) => p.toEngineBody()),
        priceData: filteredPriceData,
        params: buildEngineParams(parameters),
        cpiData,
        exchangeRates,
      };
      const result = await callEngineStrict<BacktestResult>(
        '/api/engine/backtest',
        engineBody,
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
