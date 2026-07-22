import type { RebalanceFrequency } from '@backtest/shared';
import {
  REBALANCE_FREQUENCIES,
  REBALANCE_FREQUENCY_COLORS,
  REBALANCE_LABELS,
} from '@backtest/shared';
import { apiFetch } from '@/utils/apiClient';
import { buildBacktestParameters } from '@/utils/constants';

export const REBALANCE_OPTIONS: { value: RebalanceFrequency; label: string; color: string }[] =
  REBALANCE_FREQUENCIES.map((value) => ({
    value,
    label: REBALANCE_LABELS[value],
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

export const FREQ_ORDER: Record<string, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  quarterly: 3,
  annual: 4,
};

export const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20];

/**
 * Build the request body for a single-portfolio backtest with rebalance config.
 *
 * @param label - Portfolio display name.
 * @param assets - Asset holdings (ticker + weight).
 * @param freq - Rebalance frequency.
 * @param offset - Rebalance offset (in freq units).
 * @param params - Shared backtest parameters (dates, currency, etc.).
 * @returns Request body shape consumed by `/api/v1/backtest/portfolio`.
 */
export function buildBacktestBody(
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
  return {
    portfolios: [
      {
        name: label,
        assets,
        rebalanceFrequency: freq,
        rebalanceOffset: offset,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: buildBacktestParameters(params.startDate, params.endDate, {
      startingValue: params.startingValue,
      baseCurrency: params.baseCurrency,
      adjustForInflation: params.adjustForInflation,
    }),
  };
}

/**
 * Mutate the first portfolio to attach rebalance band thresholds (when set).
 *
 * @param portfolios - Portfolios array (mutated in place).
 * @param absoluteBand - Absolute weight drift band; '' disables.
 * @param relativeBand - Relative weight drift band; '' disables.
 * @returns void.
 */
export function applyRebalanceBands(
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

/**
 * Extract a `FreqResult` from a raw backtest API response.
 *
 * @param json - Raw API response (with or without `{ data: ... }` envelope).
 * @param freq - Rebalance frequency for this result.
 * @param label - Display label.
 * @param color - Chart color.
 * @returns Parsed frequency result.
 * @throws {Error} When no portfolio result is present in the response.
 */
export function extractFreqResult(
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
  if (!p) throw new Error(`无结果 (${label})`);
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

/**
 * Run a backtest for a single rebalance frequency and extract its result.
 *
 * @param freq - Rebalance frequency to test.
 * @param assets - Asset holdings.
 * @param params - Shared backtest parameters.
 * @param absoluteBand - Optional absolute rebalance band; '' disables.
 * @param relativeBand - Optional relative rebalance band; '' disables.
 * @returns Parsed frequency result.
 * @throws {Error} On HTTP failure, API-level failure, or missing portfolio.
 */
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
  if (json.success === false) throw new Error(json.error || `回测失败 (${opt.label})`);
  return extractFreqResult(json, freq, opt.label, opt.color);
}

/**
 * Run a backtest for a specific offset and return its CAGR.
 *
 * @param offset - Rebalance offset to test.
 * @param freq - Rebalance frequency.
 * @param assets - Asset holdings.
 * @param params - Shared backtest parameters.
 * @returns Offset and its CAGR (0 on HTTP failure).
 */
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
