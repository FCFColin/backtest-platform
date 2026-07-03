/** @file MonteCarlo shared types */

export type PortfolioMode = 1 | 2;
export type ResultTab = 'summary' | 'range' | 'success' | 'distributions' | 'scenarios';
export type DistMetric =
  'finalValue' | 'cagr' | 'maxDrawdown' | 'volatility' | 'sharpe' | 'sortino';
export type SimMode = 'standard' | 'frontier';

export interface PortfolioState {
  name: string;
  assets: { ticker: string; weight: number }[];
  rebalanceFrequency: string;
}

export interface SimExecParams {
  portfolios: PortfolioState[];
  portfolioMode: PortfolioMode;
  isComplete: (pIdx: number) => boolean;
  numYears: number;
  numSimulations: number;
  minBlock: number;
  maxBlock: number;
  withReplacement: boolean;
  randomSeed: string;
  startDate: string;
  endDate: string;
  startingValue: number;
  simMode: SimMode;
  goal1: string;
  goal2: string;
  goalWeight: number;
}

export interface RangeDataPoint {
  month: number;
  label: string;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export function createDefaultPortfolio(suffix: number): PortfolioState {
  return {
    name: `组合 ${suffix}`,
    assets:
      suffix === 1
        ? [
            { ticker: 'VTI', weight: 60 },
            { ticker: 'BND', weight: 40 },
          ]
        : [
            { ticker: 'VXUS', weight: 50 },
            { ticker: 'BND', weight: 50 },
          ],
    rebalanceFrequency: 'yearly',
  };
}

export const GOAL_OPTIONS: { value: string; label: string }[] = [
  { value: 'maxCagrPercentile', label: '最大化 CAGR 百分位' },
  { value: 'minMaxDrawdown', label: '最小化最大回撤' },
  { value: 'maxSharpe', label: '最大化夏普比率' },
  { value: 'minVolatility', label: '最小化波动率' },
  { value: 'maxFinalValue', label: '最大化终值' },
  { value: 'maxSuccessRate', label: '最大化保本概率' },
];

export const SUMMARY_STATS = [
  'Min',
  'P10',
  'P25',
  'P50',
  'Mean',
  'P75',
  'P90',
  'Max',
  'Std',
] as const;
