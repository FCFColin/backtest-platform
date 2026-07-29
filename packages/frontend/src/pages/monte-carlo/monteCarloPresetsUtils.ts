import type { PortfolioMode } from './monteCarloTypes.js';
import i18n from '@/i18n/index.js';

interface PresetButtonProps {
  label: string;
  onClick: () => void;
}

function createDefaultPortfolio(suffix: number): {
  name: string;
  assets: { ticker: string; weight: number }[];
  rebalanceFrequency: string;
} {
  return {
    name: i18n.t('common.portfolioSuffix', { suffix }),
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

export function buildPresets(t: {
  setPortfolioMode: (m: PortfolioMode) => void;
  setPortfolios: (
    p: { name: string; assets: { ticker: string; weight: number }[]; rebalanceFrequency: string }[],
  ) => void;
  setNumYears: (n: number) => void;
  setNumSimulations: (n: number) => void;
  setStartingValue: (n: number) => void;
  setMinBlock: (n: number) => void;
  setMaxBlock: (n: number) => void;
}): PresetButtonProps[] {
  return [
    {
      label: i18n.t('monteCarlo.presets.preset6040'),
      onClick: () => {
        t.setPortfolioMode(1);
        t.setPortfolios([
          {
            ...createDefaultPortfolio(1),
            assets: [
              { ticker: 'VTI', weight: 60 },
              { ticker: 'BND', weight: 40 },
            ],
          },
        ]);
        t.setNumYears(20);
        t.setNumSimulations(500);
        t.setStartingValue(100000);
        t.setMinBlock(1);
        t.setMaxBlock(5);
      },
    },
    {
      label: i18n.t('monteCarlo.presets.presetAllStockDCA'),
      onClick: () => {
        t.setPortfolioMode(1);
        t.setPortfolios([
          { ...createDefaultPortfolio(1), assets: [{ ticker: 'VTI', weight: 100 }] },
        ]);
        t.setNumYears(30);
        t.setNumSimulations(1000);
        t.setStartingValue(50000);
        t.setMinBlock(1);
        t.setMaxBlock(5);
      },
    },
    {
      label: i18n.t('monteCarlo.presets.presetThreeFund'),
      onClick: () => {
        t.setPortfolioMode(1);
        t.setPortfolios([
          {
            ...createDefaultPortfolio(1),
            assets: [
              { ticker: 'VTI', weight: 50 },
              { ticker: 'VXUS', weight: 30 },
              { ticker: 'BND', weight: 20 },
            ],
          },
        ]);
        t.setNumYears(25);
        t.setNumSimulations(500);
        t.setStartingValue(200000);
        t.setMinBlock(2);
        t.setMaxBlock(8);
      },
    },
  ];
}
