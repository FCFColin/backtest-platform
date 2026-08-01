import type { BacktestParameters } from '@backtest/shared/types';
import { DataNotFoundError, ValidationError } from '../../utils/errors.js';

export function buildEngineParams(parameters: BacktestParameters) {
  return {
    startDate: parameters.startDate,
    endDate: parameters.endDate,
    startingValue: parameters.startingValue ?? 10000,
    adjustForInflation: parameters.adjustForInflation ?? false,
    rollingWindowMonths: parameters.rollingWindowMonths ?? 12,
    benchmarkTicker: parameters.benchmarkTicker ?? '',
    extendedWithdrawalStats: parameters.extendedWithdrawalStats ?? false,
    cashflowLegs: parameters.cashflowLegs ?? [],
    oneTimeCashflows: parameters.oneTimeCashflows ?? [],
  };
}

function hasPriceData(priceData: Record<string, Record<string, number>>, ticker: string): boolean {
  return !!priceData[ticker] && Object.keys(priceData[ticker]).length > 0;
}

export function ensurePriceDataExists(
  tickers: string[],
  priceData: Record<string, Record<string, number>>,
  context?: string,
): void {
  const missing = tickers.filter((t) => !hasPriceData(priceData, t));
  if (missing.length > 0) {
    const prefix = context ? `[${context}] ` : '';
    throw new DataNotFoundError(`${prefix}Price data not found for: ${missing.join(', ')}`);
  }
}

export function ensureTickerHasData(
  ticker: string,
  priceData: Record<string, Record<string, number>>,
  label?: string,
): void {
  if (!hasPriceData(priceData, ticker)) {
    const prefix = label ? `${label} ` : '';
    throw new DataNotFoundError(`未找到 ${prefix}${ticker} 的价格数据`);
  }
}

export function normalizeTickers(tickers: string[]): string[] {
  return Array.from(new Set(tickers.map((t) => String(t).trim().toUpperCase()).filter(Boolean)));
}

export function ensureSufficientTradingDays(
  dates: string[],
  minCount: number,
  context?: string,
): void {
  if (dates.length < minCount) {
    const prefix = context ? `[${context}] ` : '';
    throw new ValidationError(
      `${prefix}有效交易日不足（${dates.length}/${minCount}），无法运行回测`,
    );
  }
}
