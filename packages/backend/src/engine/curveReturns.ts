/**
 * 收益曲线计算 — backtestRunner.ts 的支撑模块。
 * tactical 专用，与 Go engine 概念重叠但合规保留（ADR-008）。
 */

import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import type { PriceData } from '@backtest/shared';

// ===== Price Data Types & Helpers (from curveData.ts) =====

export type { PriceData };

export type DateValueMap = Record<string, number>;

const sortedDatesCache = new WeakMap<PriceData, string[]>();

export function getSortedDates(priceData: PriceData): string[] {
  const cached = sortedDatesCache.get(priceData);
  if (cached) return cached;

  const dateSet = new Set<string>();
  for (const ticker of Object.keys(priceData)) {
    for (const date of Object.keys(priceData[ticker])) {
      dateSet.add(date);
    }
  }
  const result = Array.from(dateSet).sort();
  sortedDatesCache.set(priceData, result);
  return result;
}

export function getPrice(priceData: PriceData, ticker: string, date: string): number | null {
  return priceData[ticker]?.[date] ?? null;
}

export function findClosestDate(date: string, data: DateValueMap): string | null {
  const d = new Date(date);
  for (let i = 0; i < 10; i++) {
    d.setDate(d.getDate() - 1);
    const key = d.toISOString().substring(0, 10);
    if (data[key] !== undefined) return key;
  }
  return null;
}

export function getPriceWithFx(
  priceData: PriceData,
  ticker: string,
  date: string,
  exchangeRates?: DateValueMap,
): number | null {
  const raw = getPrice(priceData, ticker, date);
  if (raw === null) return null;
  if (!exchangeRates || Object.keys(exchangeRates).length === 0) return raw;
  if (raw <= 0) return raw;
  if (exchangeRates[date] !== undefined) return raw * exchangeRates[date];
  const closest = findClosestDate(date, exchangeRates);
  return closest !== null ? raw * exchangeRates[closest] : raw;
}

// ===== Inflation Adjustment (from inflation.ts) =====

export function findCpiForDate(date: string, cpiData: DateValueMap): number {
  if (date.length < 10) return 0;
  if (cpiData[date] !== undefined) return cpiData[date];
  const monthStart = date.substring(0, 8) + '01';
  if (cpiData[monthStart] !== undefined) return cpiData[monthStart];
  const closest = findClosestDate(date, cpiData);
  return closest !== null ? cpiData[closest] : 0;
}

export function applyInflationAdjustment(
  values: number[],
  growthCurve: Array<{ date: string; value: number }>,
  dates: string[],
  cpiData?: DateValueMap,
): void {
  if (!cpiData || Object.keys(cpiData).length === 0) return;
  const startCpi = findCpiForDate(dates[0], cpiData);
  if (startCpi <= 0) return;
  for (let i = 0; i < dates.length; i++) {
    const dateCpi = findCpiForDate(dates[i], cpiData);
    if (dateCpi > 0) {
      const realValue = values[i] * (startCpi / dateCpi);
      growthCurve[i].value = realValue;
      values[i] = realValue;
    }
  }
}

// ===== Drag Cost Calculation (from drag.ts) =====

export function calculateDrag(
  portfolioValue: number[],
  _cashflows: Array<{ date: string; amount: number }>,
  _rebalanceFrequency: string,
  dragPct: number = 0.001,
): {
  totalDrag: number;
  annualDrag: number;
  dragSeries: number[];
} {
  if (portfolioValue.length === 0) {
    return { totalDrag: 0, annualDrag: 0, dragSeries: [] };
  }

  const dragSeries: number[] = [];
  let cumulativeDrag = 0;

  for (let i = 0; i < portfolioValue.length; i++) {
    const prevValue = i > 0 ? portfolioValue[i - 1] : portfolioValue[0];
    const periodDrag = (prevValue * dragPct) / TRADING_DAYS_PER_YEAR;
    cumulativeDrag += periodDrag;
    dragSeries.push(cumulativeDrag);
  }

  const years = portfolioValue.length / TRADING_DAYS_PER_YEAR;
  const finalValue = portfolioValue[portfolioValue.length - 1];
  const annualDrag = years > 0 && finalValue !== 0 ? cumulativeDrag / years / finalValue : 0;

  return {
    totalDrag: cumulativeDrag,
    annualDrag,
    dragSeries,
  };
}

// ===== Curve Return Functions =====

export function calcRollingReturns(
  values: number[],
  dates: string[],
  windowMonths: number,
): Array<{ date: string; return: number }> {
  const result: Array<{ date: string; return: number }> = [];
  const windowDays = Math.round((windowMonths * TRADING_DAYS_PER_YEAR) / 12);

  for (let i = windowDays; i < values.length; i++) {
    if (values[i - windowDays] > 0) {
      const rollingReturn = values[i] / values[i - windowDays] - 1;
      result.push({ date: dates[i], return: rollingReturn });
    }
  }

  return result;
}

export function calcAnnualReturns(
  values: number[],
  dates: string[],
): Array<{ year: number; return: number }> {
  const result: Array<{ year: number; return: number }> = [];

  const yearLastValue = new Map<number, number>();
  for (let i = 0; i < values.length; i++) {
    const year = new Date(dates[i]).getFullYear();
    yearLastValue.set(year, values[i]);
  }

  const sortedYears = Array.from(yearLastValue.keys()).sort((a, b) => a - b);

  for (let idx = 0; idx < sortedYears.length; idx++) {
    const year = sortedYears[idx];
    const endValue = yearLastValue.get(year) ?? 0;
    let startValue: number;

    if (idx === 0) {
      startValue = values[0];
    } else {
      startValue = yearLastValue.get(sortedYears[idx - 1]) ?? 0;
    }

    if (startValue > 0) {
      result.push({ year, return: endValue / startValue - 1 });
    }
  }

  return result;
}

export function calcMonthlyReturns(
  values: number[],
  dates: string[],
): Array<{ year: number; month: number; return: number }> {
  const result: Array<{ year: number; month: number; return: number }> = [];
  const monthMap = new Map<string, { firstValue: number; lastValue: number }>();

  for (let i = 0; i < values.length; i++) {
    const d = new Date(dates[i]);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!monthMap.has(key)) {
      monthMap.set(key, { firstValue: values[i], lastValue: values[i] });
    } else {
      const entry = monthMap.get(key);
      if (entry) entry.lastValue = values[i];
    }
  }

  for (const [key, { firstValue, lastValue }] of monthMap) {
    const [year, month] = key.split('-').map(Number);
    if (firstValue > 0) {
      result.push({ year, month: month + 1, return: lastValue / firstValue - 1 });
    }
  }

  return result.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
}
