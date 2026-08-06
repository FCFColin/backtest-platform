import type {
  BacktestParameters,
  BaseCurrency,
  CashflowLeg,
  OneTimeCashflow,
  RebalanceFrequency,
} from '@backtest/shared';

export const INPUT_WIDTHS = {
  ticker: 'w-[220px]',
  weight: 'w-[100px]',
  percent: 'w-[100px]',
  currency: 'w-[180px]',
  currencyLong: 'w-[220px]',
  date: 'w-[180px]',
  integer: 'w-[120px]',
  ratio: 'w-[120px]',
  select: 'w-[220px]',
  selectShort: 'w-[140px]',
  search: 'w-[320px]',
} as const;

export const CARD_WIDTHS = {
  portfolio: { min: 320, max: 460 },
  cashflow: { min: 300, max: 400 },
  saved: { min: 260, max: 340 },
  metric: { min: 200, max: 260 },
  hero: { min: 300, max: 400 },
} as const;

export const CARD_GRID_CLASSES = {
  portfolio: 'grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4',
  cashflow: 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4',
  saved: 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3',
  metric: 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3',
  hero: 'grid grid-cols-1 md:grid-cols-3 gap-6',
} as const;

export const CONTAINER_WIDTHS = {
  page: 'max-w-[1440px] mx-auto px-6',
  content: 'max-w-[1280px] mx-auto',
  narrow: 'max-w-[860px] mx-auto',
  form: 'max-w-[720px] mx-auto',
} as const;

export const DEFAULT_START_DATE = '2015-01-01';
export const DEFAULT_END_DATE = '2024-12-31';
export const DEFAULT_BACKTEST_START_DATE = '2010-01-01';
export const DEFAULT_60_40_ASSETS: { ticker: string; weight: number }[] = [
  { ticker: 'VTI', weight: 60 },
  { ticker: 'BND', weight: 40 },
];

interface BuildBacktestParametersOptions {
  startingValue?: number;
  adjustForInflation?: boolean;
  baseCurrency?: BaseCurrency;
  rollingWindowMonths?: number;
  benchmarkTicker?: string;
  extendedWithdrawalStats?: boolean;
  cashflowLegs?: CashflowLeg[];
  oneTimeCashflows?: OneTimeCashflow[];
}

export function buildBacktestParameters(
  startDate: string,
  endDate: string,
  options?: BuildBacktestParametersOptions,
): BacktestParameters {
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
    ...options,
  };
}

interface SinglePortfolioBodyOptions {
  rebalanceFrequency?: RebalanceFrequency | string;
  rebalanceOffset?: number;
  id?: string;
}
export function buildSinglePortfolioBody(
  name: string,
  assets: Array<{ ticker: string; weight: number }>,
  options: SinglePortfolioBodyOptions = {},
  parameters: BacktestParameters = buildBacktestParameters('', ''),
) {
  return {
    portfolios: [
      {
        ...(options.id ? { id: options.id } : {}),
        name,
        assets,
        rebalanceFrequency: options.rebalanceFrequency ?? 'quarterly',
        rebalanceOffset: options.rebalanceOffset ?? 0,
        drag: 0,
        totalReturn: true,
      },
    ],
    parameters,
  };
}

export const REBALANCE_LBL: Record<RebalanceFrequency, string> = {
  none: 'portfolio.rebalanceNone',
  annual: 'portfolio.rebalanceAnnual',
  quarterly: 'portfolio.rebalanceQuarterly',
  monthly: 'portfolio.rebalanceMonthly',
  weekly: 'portfolio.rebalanceWeekly',
  daily: 'portfolio.rebalanceDaily',
  threshold: 'portfolio.rebalanceThreshold',
};
