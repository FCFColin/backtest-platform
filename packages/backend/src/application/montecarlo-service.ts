/**
 * 蒙特卡洛模拟应用服务。
 *
 * 负责蒙特卡洛模拟端点的数据获取与引擎调用编排。
 */
import { callEngineStrict } from '../utils/engineClient.js';
import { buildEngineParams } from './backtest/engineBodyBuilder.js';
import { Portfolio as DomainPortfolio } from '../domain/aggregates/portfolio.js';
import {
  collectTickersFromPortfolios,
  fetchPriceDataWithRange,
  filterPriceData,
  loadMacroData,
  sanitizeMcParams,
  translateDomainError,
  collectInvalidTickerWarnings,
  calculateDateRange,
} from './backtest-helpers.js';
import type { Portfolio, BacktestParameters } from '@backtest/shared/types';
import type { Warning, DateRangeInfo } from './backtest-helpers.js';

/**
 * 运行蒙特卡洛模拟。
 *
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function runMonteCarlo(
  portfolioList: Portfolio[],
  parameters: BacktestParameters,
  mcParams?: object,
): Promise<{ data: unknown; warnings: Warning[]; dateRange: DateRangeInfo }> {
  const { tickers } = collectTickersFromPortfolios(portfolioList);
  const allTickers = new Set(tickers);
  const warnings: Warning[] = [];

  const { priceData, effectiveStartDate, effectiveEndDate, degraded, degradedWarning } =
    await fetchPriceDataWithRange(tickers, parameters.startDate, parameters.endDate);

  const invalidTickers = collectInvalidTickerWarnings(allTickers, priceData, warnings);

  if (degraded) {
    warnings.push({
      code: 'DATA_DEGRADED',
      message: degradedWarning || '数据服务降级，部分数据可能缺失',
    });
  }

  const sanitizedMcParams = sanitizeMcParams(mcParams);
  const { cpiData, exchangeRates } = await loadMacroData(parameters);

  const effectiveParameters =
    effectiveStartDate !== parameters.startDate || effectiveEndDate !== parameters.endDate
      ? { ...parameters, startDate: effectiveStartDate, endDate: effectiveEndDate }
      : parameters;

  const results = await Promise.all(
    portfolioList.map((p) =>
      callEngineStrict('/api/engine/monte-carlo', {
        portfolio: translateDomainError(() => DomainPortfolio.fromDTO(p)).toEngineBody(),
        priceData: filterPriceData(priceData, allTickers),
        params: buildEngineParams(effectiveParameters),
        cpiData,
        exchangeRates,
        mcParams: sanitizedMcParams,
      }),
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
