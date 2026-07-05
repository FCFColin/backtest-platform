/** @file MonteCarlo preset example card */
import type { PortfolioMode, PortfolioState } from '../types.js';
import { createDefaultPortfolio } from '../types.js';

export function buildPresets(t: {
  setPortfolioMode: (m: PortfolioMode) => void;
  setPortfolios: (p: PortfolioState[]) => void;
  setNumYears: (n: number) => void;
  setNumSimulations: (n: number) => void;
  setStartingValue: (n: number) => void;
  setMinBlock: (n: number) => void;
  setMaxBlock: (n: number) => void;
}) {
  return [
    {
      label: '60/40 退休回测',
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
      label: '全股定投 30 年',
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
      label: '三基金 25 年',
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

export function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="toolbar-btn" onClick={onClick}>
      {label}
    </button>
  );
}

export function PresetsCard({ presets }: { presets: { label: string; onClick: () => void }[] }) {
  return (
    <div className="bt-seo-card card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>预设示例</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {presets.map((preset) => (
          <PresetButton key={preset.label} label={preset.label} onClick={preset.onClick} />
        ))}
      </div>
    </div>
  );
}
