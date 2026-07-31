/**
 * @file 合成标的元数据
 * @description 与 data-fetcher/cmd/worker/sim.go 中的 simDefinitions 保持同步。
 *   前端通过 /api/v1/data/synthetic 获取此列表用于展示和自动补全。
 */

interface SyntheticTicker {
  ticker: string;
  name: string;
  category: string;
  description: string;
  earliestDate: string;
  methodology: string;
}

/** 所有可用的合成标的（与 Go 端 simDefinitions 同步） */
export const SYNTHETIC_TICKERS: SyntheticTicker[] = [
  {
    ticker: 'SPYSIM',
    name: 'S&P 500 Index (Total Return)',
    category: 'Index',
    description: 'S&P 500 total return index. Uses SPY adjusted close from 1993.',
    earliestDate: '1993-01-29',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'VTISIM',
    name: 'US Total Market (Total Return)',
    category: 'Index',
    description: 'VTSMX (1992-2001) spliced with VTI (2001-).',
    earliestDate: '1992-11-03',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'QQQSIM',
    name: 'Nasdaq 100 (Total Return)',
    category: 'Index',
    description: 'RYOCX (1994-1999) spliced with QQQ (1999-).',
    earliestDate: '1994-03-11',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'BNDSIM',
    name: 'US Aggregate Bond (Total Return)',
    category: 'Bond',
    description: 'VBMFX (1986-2007) spliced with BND (2007-).',
    earliestDate: '1986-12-18',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'GLDSIM',
    name: 'Gold (Total Return)',
    category: 'Commodity',
    description: 'GLD adjusted close from 2004.',
    earliestDate: '2004-11-18',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'TLTSIM',
    name: 'Long-Term Treasury (Total Return)',
    category: 'Bond',
    description: 'TLT adjusted close from 2002.',
    earliestDate: '2002-07-22',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'IEFSIM',
    name: 'Mid-Term Treasury (Total Return)',
    category: 'Bond',
    description: 'IEF adjusted close from 2002.',
    earliestDate: '2002-07-26',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'SHVSIM',
    name: 'Short-Term Treasury (Total Return)',
    category: 'Bond',
    description: 'SHV adjusted close from 2007.',
    earliestDate: '2007-01-11',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'VXUSSIM',
    name: 'International Equity (Total Return)',
    category: 'Equity',
    description: 'EFA (2001-2011) spliced with VXUS (2011-).',
    earliestDate: '2001-08-20',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'VNQSIM',
    name: 'REIT (Total Return)',
    category: 'RealEstate',
    description: 'VNQ adjusted close from 2004.',
    earliestDate: '2004-09-29',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'IWMSIM',
    name: 'Russell 2000 (Total Return)',
    category: 'Equity',
    description: 'IWM adjusted close from 2000.',
    earliestDate: '2000-05-22',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'EFASIM',
    name: 'MSCI EAFE (Total Return)',
    category: 'Equity',
    description: 'EFA adjusted close from 2001.',
    earliestDate: '2001-08-20',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'EEMSIM',
    name: 'Emerging Markets (Total Return)',
    category: 'Equity',
    description: 'EEM adjusted close from 2003.',
    earliestDate: '2003-04-11',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'TIPSIM',
    name: 'TIPS (Total Return)',
    category: 'Bond',
    description: 'TIP adjusted close from 2003.',
    earliestDate: '2003-12-05',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'AGGSIM',
    name: 'US Aggregate Bond (Total Return)',
    category: 'Bond',
    description: 'AGG adjusted close from 2003.',
    earliestDate: '2003-09-29',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'SCHBSIM',
    name: 'Broad Bond (Total Return)',
    category: 'Bond',
    description: 'SCHB adjusted close from 2010.',
    earliestDate: '2010-01-14',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'VTVOXSIM',
    name: 'Intermediate Bond (Total Return)',
    category: 'Bond',
    description: 'BIV adjusted close from 2009.',
    earliestDate: '2009-04-06',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'BSVSIM',
    name: 'Short-Term Bond (Total Return)',
    category: 'Bond',
    description: 'BSV adjusted close from 2007.',
    earliestDate: '2007-04-05',
    methodology: 'splice_by_return',
  },
  {
    ticker: 'VTESIM',
    name: 'Tax-Exempt Bond (Total Return)',
    category: 'Bond',
    description: 'VTEB adjusted close from 2007.',
    earliestDate: '2007-12-07',
    methodology: 'splice_by_return',
  },
];
