export interface PresetAsset {
  ticker: string;
  weight: number;
}
export interface PresetPortfolio {
  id: string;
  nameKey: string;
  descriptionKey: string;
  assets: PresetAsset[];
  tags: string[];
}
export const PRESET_PORTFOLIOS: readonly PresetPortfolio[] = [
  {
    id: '6040',
    nameKey: 'portfolio.preset.6040.label',
    descriptionKey: 'portfolio.preset.6040.description',
    assets: [
      { ticker: 'SPY', weight: 60 },
      { ticker: 'BND', weight: 40 }
    ],
    tags: ['classic', 'balanced']
  },
  {
    id: 'allWeather',
    nameKey: 'portfolio.preset.allWeather.label',
    descriptionKey: 'portfolio.preset.allWeather.description',
    assets: [
      { ticker: 'SPY', weight: 30 },
      { ticker: 'BND', weight: 40 },
      { ticker: 'GLD', weight: 15 },
      { ticker: 'IEF', weight: 15 }
    ],
    tags: ['risk-parity', 'diversified']
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
      { ticker: 'TSLA', weight: 14.26 }
    ],
    tags: ['tech', 'concentrated', 'us']
  },
  {
    id: 'sp500',
    nameKey: 'portfolio.preset.sp500.label',
    descriptionKey: 'portfolio.preset.sp500.description',
    assets: [{ ticker: 'SPY', weight: 100 }],
    tags: ['benchmark', 'us', 'single-asset']
  },
  {
    id: 'csi300',
    nameKey: 'portfolio.preset.csi300.label',
    descriptionKey: 'portfolio.preset.csi300.description',
    assets: [{ ticker: '510300', weight: 100 }],
    tags: ['benchmark', 'cn', 'single-asset']
  }
];
export function findPresetPortfolio(id: string): PresetPortfolio | null {
  return PRESET_PORTFOLIOS.find((p) => p.id === id) ?? null;
}
