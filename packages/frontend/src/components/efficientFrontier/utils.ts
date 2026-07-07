import type { CSSProperties } from 'react';
import type { EfficientFrontierResult, EfficientFrontierPoint } from '@backtest/shared';
import type { FetchFrontierParams } from './types.js';

const POSITIVE_CORR_COLORS: Array<[number, string]> = [
  [0.8, '#1a4a7a'],
  [0.6, '#2b63b8'],
  [0.4, '#6a9fd8'],
  [0.2, '#b8d4f0'],
];
const NEGATIVE_CORR_COLORS: Array<[number, string]> = [
  [-0.8, '#8b2020'],
  [-0.6, '#b04040'],
  [-0.4, '#d47070'],
  [-0.2, '#f0c8c8'],
];

export function sharpeToColor(sharpe: number, minSharpe: number, maxSharpe: number): string {
  if (maxSharpe === minSharpe) return '#2e8b57';
  const t = Math.max(0, Math.min(1, (sharpe - minSharpe) / (maxSharpe - minSharpe)));
  const r = t < 0.5 ? 220 : Math.round(220 - (t - 0.5) * 2 * 220);
  const g = t < 0.5 ? Math.round(t * 2 * 180) : 180;
  const b = t < 0.5 ? 50 : Math.round(50 + (t - 0.5) * 2 * 37);
  return `rgb(${r},${g},${b})`;
}

export function getCorrelationColor(val: number): string {
  const thresholds = val >= 0 ? POSITIVE_CORR_COLORS : NEGATIVE_CORR_COLORS;
  for (const [threshold, color] of thresholds) {
    if (val >= 0 ? val >= threshold : val <= threshold) return color;
  }
  return 'var(--bg-subtle)';
}

export function buildBacktestParameters(startDate: string, endDate: string) {
  return {
    startDate,
    endDate,
    startingValue: 10000,
    adjustForInflation: false,
    rollingWindowMonths: 12,
    benchmarkTicker: '',
    baseCurrency: 'usd',
    extendedWithdrawalStats: false,
    cashflowLegs: [],
    oneTimeCashflows: [],
  };
}

export async function fetchFrontier(params: FetchFrontierParams): Promise<EfficientFrontierResult> {
  const {
    validTickers,
    numPoints,
    solveSpeed,
    minInclusionWeight,
    rebalanceFrequency,
    allowCash,
    returnObjective,
    solver,
    startDate,
    endDate,
  } = params;
  const res = await fetch('/api/backtest/efficient-frontier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tickers: validTickers,
      numPoints,
      solveSpeed,
      minInclusionWeight: minInclusionWeight / 100,
      rebalanceFrequency,
      allowCash,
      returnObjective,
      solver,
      parameters: buildBacktestParameters(startDate, endDate),
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || '计算失败');
  return json.data ?? json;
}

export async function fetchCorrelations(
  validTickers: string[],
  startDate: string,
  endDate: string,
): Promise<{ tickers: string[]; matrix: number[][] } | null> {
  const btBody = {
    portfolios: [
      {
        name: 'temp',
        assets: validTickers.map((t) => ({
          ticker: t,
          weight: Math.round((100 / validTickers.length) * 100) / 100,
        })),
        rebalanceFrequency: 'yearly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: buildBacktestParameters(startDate, endDate),
  };
  const btRes = await fetch('/api/backtest/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(btBody),
  });
  if (!btRes.ok) return null;
  const btJson = await btRes.json();
  const btData = btJson.data ?? btJson;
  if (btData.assetTickers && btData.assetCorrelations)
    return { tickers: btData.assetTickers, matrix: btData.assetCorrelations };
  return null;
}

export function buildPortfolioData(
  p: EfficientFrontierPoint,
  rebalanceFrequency: string,
  startDate: string,
  endDate: string,
) {
  return {
    portfolios: [
      {
        id: `portfolio-${Date.now()}-1`,
        name: '前沿组合',
        assets: Object.entries(p.weights).map(([ticker, weight]) => ({
          ticker,
          weight: Math.round(weight * 10000) / 100,
        })),
        rebalanceFrequency: rebalanceFrequency || 'quarterly',
        rebalanceOffset: 0,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters: {
      startDate,
      endDate,
      startingValue: 10000,
      baseCurrency: 'usd',
      adjustForInflation: false,
      rollingWindowMonths: 12,
      benchmarkTicker: '',
      extendedWithdrawalStats: false,
      cashflowLegs: [],
      oneTimeCashflows: [],
    },
  };
}

export const SECTION_TITLE_STYLE: CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: 'var(--text-strong)',
  marginBottom: 12,
  marginTop: 24,
};

export const FRONTIER_TOOLTIP_STYLE = {
  fontSize: 12,
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-body)',
  boxShadow: 'var(--shadow-md)',
};

export function computeFrontierDerivedData(results: EfficientFrontierResult | null) {
  const maxSharpe = results?.frontier.length
    ? results.frontier.reduce(
        (best, p) => (p.sharpeRatio > best.sharpeRatio ? p : best),
        results.frontier[0],
      )
    : undefined;
  const sharpeRange = results?.frontier.length
    ? {
        min: Math.min(...results.frontier.map((p) => p.sharpeRatio)),
        max: Math.max(...results.frontier.map((p) => p.sharpeRatio)),
      }
    : { min: 0, max: 1 };
  const scatterData = results
    ? results.frontier.map((p, idx) => ({
        expectedVolatility: p.expectedVolatility,
        expectedReturn: p.expectedReturn,
        sharpeRatio: p.sharpeRatio,
        idx,
      }))
    : [];
  const allocationData = results
    ? results.frontier.map((point, idx) => {
        const row: Record<string, number | string> = { point: idx + 1 };
        Object.entries(point.weights).forEach(([ticker, weight]) => {
          row[ticker] = Number((weight * 100).toFixed(1));
        });
        return row;
      })
    : [];
  const allAssetTickers = results?.frontier.length ? Object.keys(results.frontier[0].weights) : [];
  return { maxSharpe, sharpeRange, scatterData, allocationData, allAssetTickers };
}
