/**
 * 回测查询侧服务（T-30 / CQRS Query）
 *
 * 将原散落在 backtestRoutes 的校验与数据准备逻辑集中到应用层，
 * 路由仅做 HTTP 适配，不再直接编排引擎。
 */
import type { Portfolio, BacktestParameters } from '../../shared/types/index.js';
import { MAX_TICKERS } from '../../shared/constants.js';
import { isValidDate } from '../utils/dateUtils.js';

export interface PortfolioBacktestPrep {
  allTickers: Set<string>;
  warnings: string[];
}

/**
 * 校验日期与 ticker 数量，收集回测所需标的集合。
 *
 * @throws Error 校验失败时抛出，由路由层转为 422
 */
export function preparePortfolioBacktest(
  portfolios: Portfolio[],
  parameters: BacktestParameters,
): PortfolioBacktestPrep {
  if (!isValidDate(parameters.startDate) || !isValidDate(parameters.endDate)) {
    throw new Error('Invalid date format, expected YYYY-MM-DD');
  }

  const allTickers = new Set<string>();
  let totalAssets = 0;
  for (const portfolio of portfolios) {
    for (const asset of portfolio.assets) {
      allTickers.add(asset.ticker);
    }
    totalAssets += portfolio.assets.length;
  }

  if (portfolios.length > MAX_TICKERS || totalAssets > MAX_TICKERS) {
    throw new Error(`组合数量或资产总数超过限制 (max ${MAX_TICKERS})`);
  }
  if (parameters.benchmarkTicker) {
    allTickers.add(parameters.benchmarkTicker);
  }

  return { allTickers, warnings: [] };
}

/**
 * 根据 priceData 识别无效 ticker，填充 warnings。
 */
export function collectInvalidTickerWarnings(
  allTickers: Set<string>,
  priceData: Record<string, unknown>,
  warnings: string[],
): string[] {
  const invalidTickers: string[] = [];
  for (const ticker of allTickers) {
    const series = priceData[ticker];
    if (!series || (typeof series === 'object' && Object.keys(series as object).length === 0)) {
      invalidTickers.push(ticker);
    }
  }
  if (invalidTickers.length > 0) {
    warnings.push(`以下标的无价格数据: ${invalidTickers.join(', ')}`);
  }
  return warnings;
}
