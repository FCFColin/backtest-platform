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
  fetchPriceData,
  filterPriceData,
  loadMacroData,
  sanitizeMcParams,
  translateDomainError,
} from './backtest-helpers.js';
import type { Portfolio, BacktestParameters } from '@backtest/shared/types';

/**
 * 运行蒙特卡洛模拟。
 *
 * @throws {EngineUnavailableError} Go 引擎不可用时
 */
export async function runMonteCarlo(
  portfolioList: Portfolio[],
  parameters: BacktestParameters,
  mcParams?: object,
): Promise<unknown> {
  const { tickers } = collectTickersFromPortfolios(portfolioList);
  const allTickers = new Set(tickers);

  const priceData = await fetchPriceData(tickers, parameters.startDate, parameters.endDate);
  const sanitizedMcParams = sanitizeMcParams(mcParams);
  const { cpiData, exchangeRates } = await loadMacroData(parameters);

  const results = await Promise.all(
    portfolioList.map((p) =>
      callEngineStrict('/api/engine/monte-carlo', {
        portfolio: translateDomainError(() => DomainPortfolio.fromDTO(p)).toEngineBody(),
        priceData: filterPriceData(priceData, allTickers),
        params: buildEngineParams(parameters),
        cpiData,
        exchangeRates,
        mcParams: sanitizedMcParams,
      }),
    ),
  );

  return portfolioList.length === 1 ? results[0] : results;
}
