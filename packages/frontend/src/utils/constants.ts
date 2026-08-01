import type {
  BacktestParameters,
  BaseCurrency,
  CashflowLeg,
  OneTimeCashflow,
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
export const BASE_BACKTEST_PARAMS = {
  rollingWindowMonths: 12,
  benchmarkTicker: '',
  extendedWithdrawalStats: false,
  cashflowLegs: [] as unknown[],
  oneTimeCashflows: [] as unknown[],
};
export interface BuildBacktestParametersOptions {
  startingValue?: number;
  adjustForInflation?: boolean;
  baseCurrency?: BaseCurrency;
  rollingWindowMonths?: number;
  benchmarkTicker?: string;
  extendedWithdrawalStats?: boolean;
  cashflowLegs?: CashflowLeg[];
  oneTimeCashflows?: OneTimeCashflow[];
}
export type { BacktestParameters };
export function buildBacktestParameters(
  startDate: string,
  endDate: string,
  options?: BuildBacktestParametersOptions,
): BacktestParameters {
  const defaults: BacktestParameters = {
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
  return { ...defaults, ...options };
}
interface TickerPreset {
  ticker: string;
  name: string;
  category: string;
  sourceTicker?: string;
}
export const SIM_TICKERS: TickerPreset[] = [
  { ticker: 'SPYSIM', name: 'S&P 500 指数 (Total Return)', category: 'Index', sourceTicker: 'SPY' },
  { ticker: 'BNDSIM', name: '美国综合债券 (Total Return)', category: 'Bond', sourceTicker: 'AGG' },
  { ticker: 'GLDSIM', name: '黄金 (Total Return)', category: 'Commodity', sourceTicker: 'GLD' },
  { ticker: 'QQQSIM', name: '纳斯达克 100 (Total Return)', category: 'Index', sourceTicker: 'QQQ' },
  { ticker: 'VTISIM', name: '美国全市场 (Total Return)', category: 'Index', sourceTicker: 'VTI' },
  { ticker: 'TLTSIM', name: '长期美国国债 (Total Return)', category: 'Bond', sourceTicker: 'TLT' },
];
export const ETF_PRESETS: TickerPreset[] = [
  { ticker: 'SPY', name: 'S&P 500 ETF', category: 'US Equity' },
  { ticker: 'VTI', name: '全市场 ETF', category: 'US Equity' },
  { ticker: 'QQQ', name: '纳斯达克 100 ETF', category: 'US Equity' },
  { ticker: 'BND', name: '全债券 ETF', category: 'Bond' },
  { ticker: 'AGG', name: '综合债券 ETF', category: 'Bond' },
  { ticker: 'TLT', name: '长期国债 ETF', category: 'Bond' },
  { ticker: 'GLD', name: '黄金 ETF', category: 'Commodity' },
  { ticker: 'VT', name: '全球市场 ETF', category: 'International' },
  { ticker: 'VXUS', name: '国际市场 ETF', category: 'International' },
  { ticker: 'EEM', name: '新兴市场 ETF', category: 'International' },
  { ticker: 'IWM', name: '罗素 2000 ETF', category: 'US Equity' },
  { ticker: 'VTV', name: '价值股 ETF', category: 'US Equity' },
  { ticker: 'VUG', name: '成长股 ETF', category: 'US Equity' },
  { ticker: 'SCHD', name: '红利 ETF', category: 'US Equity' },
  { ticker: 'TIP', name: '通胀保护债券 ETF', category: 'Bond' },
  { ticker: 'LQD', name: '公司债 ETF', category: 'Bond' },
  { ticker: 'HYG', name: '高收益债 ETF', category: 'Bond' },
  { ticker: 'VNQ', name: '房地产 ETF', category: 'Real Estate' },
  { ticker: 'GSG', name: '商品 ETF', category: 'Commodity' },
  { ticker: 'DBC', name: '综合商品 ETF', category: 'Commodity' },
];
export const ALL_TICKER_PRESETS = [...SIM_TICKERS, ...ETF_PRESETS];
export function filterTickers(input: string, limit: number = 8): TickerPreset[] {
  if (!input || input.length < 1) return [];
  const upper = input.toUpperCase();
  return ALL_TICKER_PRESETS.filter(
    (p) => p.ticker.startsWith(upper) || p.name.includes(input),
  ).slice(0, limit);
}
