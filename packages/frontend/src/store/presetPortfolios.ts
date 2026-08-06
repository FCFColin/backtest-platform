import type { RebalanceFrequency } from '@backtest/shared';

interface PresetAsset {
  ticker: string;
  weight: number;
}
interface PresetPortfolio {
  id: string;
  nameKey: string;
  descriptionKey: string;
  assets: PresetAsset[];
  tags: string[];
  rebalanceFrequency?: RebalanceFrequency;
}

export const PRESET_PORTFOLIOS: readonly PresetPortfolio[] = [
  {
    id: '6040',
    nameKey: 'portfolio.preset.6040.label',
    descriptionKey: 'portfolio.preset.6040.description',
    assets: [
      { ticker: 'SPY', weight: 60 },
      { ticker: 'BND', weight: 40 },
    ],
    tags: ['classic', 'balanced'],
  },
  {
    id: '80-20',
    nameKey: 'portfolio.preset.80-20.label',
    descriptionKey: 'portfolio.preset.80-20.description',
    assets: [
      { ticker: 'VTI', weight: 80 },
      { ticker: 'BND', weight: 20 },
    ],
    tags: ['equity', 'growth'],
    rebalanceFrequency: 'quarterly',
  },
  {
    id: '40-60',
    nameKey: 'portfolio.preset.40-60.label',
    descriptionKey: 'portfolio.preset.40-60.description',
    assets: [
      { ticker: 'VTI', weight: 40 },
      { ticker: 'BND', weight: 60 },
    ],
    tags: ['conservative', 'income'],
    rebalanceFrequency: 'quarterly',
  },
  {
    id: 'three-fund',
    nameKey: 'portfolio.preset.three-fund.label',
    descriptionKey: 'portfolio.preset.three-fund.description',
    assets: [
      { ticker: 'VTI', weight: 50 },
      { ticker: 'VXUS', weight: 30 },
      { ticker: 'BND', weight: 20 },
    ],
    tags: ['diversified', 'global'],
    rebalanceFrequency: 'quarterly',
  },
  {
    id: 'allWeather',
    nameKey: 'portfolio.preset.allWeather.label',
    descriptionKey: 'portfolio.preset.allWeather.description',
    assets: [
      { ticker: 'SPY', weight: 30 },
      { ticker: 'BND', weight: 40 },
      { ticker: 'GLD', weight: 15 },
      { ticker: 'IEF', weight: 15 },
    ],
    tags: ['risk-parity', 'diversified'],
  },
  {
    id: 'permanent',
    nameKey: 'portfolio.preset.permanent.label',
    descriptionKey: 'portfolio.preset.permanent.description',
    assets: [
      { ticker: 'VTI', weight: 25 },
      { ticker: 'TLT', weight: 25 },
      { ticker: 'GLD', weight: 25 },
      { ticker: 'SHV', weight: 25 },
    ],
    tags: ['risk-parity', 'all-weather'],
    rebalanceFrequency: 'quarterly',
  },
  {
    id: 'mag7',
    nameKey: 'portfolio.preset.mag7.label',
    descriptionKey: 'portfolio.preset.mag7.description',
    assets: [
      { ticker: 'AAPL', weight: 14.29 },
      { ticker: 'MSFT', weight: 14.29 },
      { ticker: 'GOOGL', weight: 14.29 },
      { ticker: 'AMZN', weight: 14.29 },
      { ticker: 'META', weight: 14.29 },
      { ticker: 'NVDA', weight: 14.29 },
      { ticker: 'TSLA', weight: 14.26 },
    ],
    tags: ['tech', 'concentrated', 'us'],
  },
  {
    id: 'sp500',
    nameKey: 'portfolio.preset.sp500.label',
    descriptionKey: 'portfolio.preset.sp500.description',
    assets: [{ ticker: 'SPY', weight: 100 }],
    tags: ['benchmark', 'us', 'single-asset'],
  },
  {
    id: 'csi300',
    nameKey: 'portfolio.preset.csi300.label',
    descriptionKey: 'portfolio.preset.csi300.description',
    assets: [{ ticker: '510300', weight: 100 }],
    tags: ['benchmark', 'cn', 'single-asset'],
  },
];

const PRESET_ID_ALIASES: Record<string, string> = { '60-40': '6040', 'all-weather': 'allWeather' };

export function findPresetPortfolio(id: string): PresetPortfolio | null {
  return PRESET_PORTFOLIOS.find((p) => p.id === (PRESET_ID_ALIASES[id] ?? id)) ?? null;
}
