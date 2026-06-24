/** 预设 Ticker 分类 */
export interface TickerPreset {
  ticker: string;
  name: string;
  category: string;
}

/** SIM 系列（模拟数据 Ticker） */
export const SIM_TICKERS: TickerPreset[] = [
  { ticker: 'SPYSIM', name: 'S&P 500 模拟', category: 'SIM' },
  { ticker: 'BNDSIM', name: '债券模拟', category: 'SIM' },
  { ticker: 'GLDSIM', name: '黄金模拟', category: 'SIM' },
  { ticker: 'QQQSIM', name: '纳斯达克 100 模拟', category: 'SIM' },
  { ticker: 'VTISIM', name: '全市场模拟', category: 'SIM' },
  { ticker: 'TLTSIM', name: '长期国债模拟', category: 'SIM' },
];

/** 常用 ETF 预设 */
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

/** 所有预设 Ticker（合并） */
export const ALL_TICKER_PRESETS = [...SIM_TICKERS, ...ETF_PRESETS];

/** 根据输入文本过滤匹配的预设 Ticker */
export function filterTickers(input: string, limit: number = 8): TickerPreset[] {
  if (!input || input.length < 1) return [];
  const upper = input.toUpperCase();
  return ALL_TICKER_PRESETS.filter(
    (p) => p.ticker.startsWith(upper) || p.name.includes(input)
  ).slice(0, limit);
}
