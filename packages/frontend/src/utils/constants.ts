import type {
  BacktestParameters,
  BaseCurrency,
  CashflowLeg,
  OneTimeCashflow,
  RebalanceFrequency,
} from '@backtest/shared';

export const DEFAULT_START_DATE = '2015-01-01';
export const DEFAULT_END_DATE = '2026-08-10';
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
