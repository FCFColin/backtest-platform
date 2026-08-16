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
    cashflowLegs: parameters.cashflowLegs ?? [],
    oneTimeCashflows: parameters.oneTimeCashflows ?? [],
  };
}

export function ensurePriceDataExists(
  tickers: string[],
  priceData: Record<string, Record<string, number>>,
  context?: string,
): void {
  const missing = tickers.filter((t) => !priceData[t] || Object.keys(priceData[t]).length === 0);
  if (missing.length > 0) {
    const prefix = context ? `[${context}] ` : '';
    throw new DataNotFoundError(`${prefix}Price data not found for: ${missing.join(', ')}`);
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
