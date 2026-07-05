import type { Statistics } from '@backtest/shared/types';
import type { CompareResult } from './types.js';

export function extractStats(
  stats: Statistics,
): Pick<
  CompareResult,
  | 'cagr'
  | 'stdev'
  | 'maxDrawdown'
  | 'sharpe'
  | 'sortino'
  | 'calmar'
  | 'maxDrawdownDuration'
  | 'ulcerIndex'
> {
  return {
    cagr: stats?.cagr ?? 0,
    stdev: stats?.stdev ?? 0,
    maxDrawdown: stats?.maxDrawdown ?? 0,
    sharpe: stats?.sharpe ?? 0,
    sortino: stats?.sortino ?? 0,
    calmar: stats?.calmar,
    maxDrawdownDuration: stats?.maxDrawdownDuration,
    ulcerIndex: stats?.ulcerIndex,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toResult(p: any, label: string): CompareResult {
  const curve = p.growthCurve ?? [];
  return {
    label,
    ...extractStats(p.statistics as Statistics),
    finalValue: curve.length > 0 ? curve[curve.length - 1].value : 0,
    growthCurve: curve,
  };
}

export async function fetchBacktest(body: unknown) {
  const res = await fetch('/api/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res;
}

export function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

export function fmtNum(v: number): string {
  return v.toFixed(2);
}

export function fmtMoney(baseCurrency: 'usd' | 'cny', v: number): string {
  return baseCurrency === 'usd'
    ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `¥${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
