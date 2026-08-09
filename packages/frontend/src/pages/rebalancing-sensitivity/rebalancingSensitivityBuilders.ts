import {
  REBALANCE_FREQUENCIES,
  REBALANCE_FREQUENCY_COLORS,
  REBALANCE_LABELS,
  type RebalanceFrequency,
} from '@backtest/shared';
import i18n from '@/i18n/index.js';
import { apiFetch } from '@/utils/apiClient';
import { buildBacktestParameters, buildSinglePortfolioBody } from '@/utils/constants';
export const REBALANCE_OPTIONS: { value: RebalanceFrequency; label: string; color: string }[] =
  REBALANCE_FREQUENCIES.map((value) => ({
    value,
    label: i18n.t(REBALANCE_LABELS[value]),
    color: REBALANCE_FREQUENCY_COLORS[value],
  }));
export interface FreqResult {
  frequency: RebalanceFrequency;
  label: string;
  color: string;
  cagr: number;
  stdev: number;
  maxDrawdown: number;
  sharpe: number;
  sortino: number;
  growthCurve?: Array<{ date: string; value: number }>;
}
export const FREQ_ORDER = Object.fromEntries(REBALANCE_FREQUENCIES.map((f, i) => [f, i]));
export const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];
function buildBacktestBody(
  label: string,
  assets: Array<{ ticker: string; weight: number }>,
  freq: RebalanceFrequency,
  offset: number,
  params: {
    startDate: string;
    endDate: string;
    startingValue: number;
    baseCurrency: 'usd' | 'cny';
    adjustForInflation: boolean;
  },
) {
  return buildSinglePortfolioBody(
    label,
    assets,
    { rebalanceFrequency: freq, rebalanceOffset: offset },
    buildBacktestParameters(params.startDate, params.endDate, {
      startingValue: params.startingValue,
      baseCurrency: params.baseCurrency,
      adjustForInflation: params.adjustForInflation,
    }),
  );
}
function applyRebalanceBands(
  portfolios: Array<Record<string, unknown>>,
  absoluteBand: number | '',
  relativeBand: number | '',
) {
  if (absoluteBand === '' && relativeBand === '') return;
  portfolios[0].rebalanceBands = {
    enabled: true,
    absoluteBand: absoluteBand !== '' ? Number(absoluteBand) : undefined,
    relativeBand: relativeBand !== '' ? Number(relativeBand) : undefined,
  };
}
function extractFreqResult(
  json: unknown,
  freq: RebalanceFrequency,
  label: string,
  color: string,
): FreqResult {
  const data = (json as { data?: unknown })?.data ?? json;
  const p = (
    data as {
      portfolios?: Array<{
        statistics?: Record<string, number>;
        growthCurve?: Array<{ date: string; value: number }>;
      }>;
    }
  )?.portfolios?.[0];
  if (!p) throw new Error(i18n.t('No results ({{label}})', { label }));
  const stats = p.statistics ?? {};
  return {
    frequency: freq,
    label,
    color,
    cagr: stats.cagr ?? 0,
    stdev: stats.stdev ?? 0,
    maxDrawdown: stats.maxDrawdown ?? 0,
    sharpe: stats.sharpe ?? 0,
    sortino: stats.sortino ?? 0,
    growthCurve: p.growthCurve,
  };
}
export async function fetchFreqResult(
  freq: RebalanceFrequency,
  assets: Array<{ ticker: string; weight: number }>,
  params: {
    startDate: string;
    endDate: string;
    startingValue: number;
    baseCurrency: 'usd' | 'cny';
    adjustForInflation: boolean;
  },
  absoluteBand: number | '',
  relativeBand: number | '',
): Promise<FreqResult> {
  const opt = REBALANCE_OPTIONS.find((o) => o.value === freq)!;
  const body = buildBacktestBody(opt.label, assets, freq, 0, params);
  applyRebalanceBands(
    body.portfolios as Array<Record<string, unknown>>,
    absoluteBand,
    relativeBand,
  );
  const res = await apiFetch('/api/v1/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${opt.label})`);
  const json = await res.json();
  if (json.success === false)
    throw new Error(json.error || i18n.t('Backtest failed ({{label}})', { label: opt.label }));
  return extractFreqResult(json, freq, opt.label, opt.color);
}
export async function fetchOffsetResult(
  offset: number,
  freq: RebalanceFrequency,
  assets: Array<{ ticker: string; weight: number }>,
  params: {
    startDate: string;
    endDate: string;
    startingValue: number;
    baseCurrency: 'usd' | 'cny';
    adjustForInflation: boolean;
  },
): Promise<{ offset: number; cagr: number }> {
  const body = buildBacktestBody(`offset-${offset}`, assets, freq, offset, params);
  const res = await apiFetch('/api/v1/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { offset, cagr: 0 };
  const json = await res.json();
  return { offset, cagr: (json.data ?? json).portfolios?.[0]?.statistics?.cagr ?? 0 };
}
