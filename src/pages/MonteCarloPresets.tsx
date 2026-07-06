import { Link } from 'react-router-dom';
import type { PortfolioMode } from './MonteCarloParams.js';

interface PortfolioState {
  name: string;
  assets: { ticker: string; weight: number }[];
  rebalanceFrequency: string;
}

function createDefaultPortfolio(suffix: number): PortfolioState {
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

interface PresetButtonProps {
  label: string;
  onClick: () => void;
}

function buildPresets(t: {
  setPortfolioMode: (m: PortfolioMode) => void;
  setPortfolios: (p: PortfolioState[]) => void;
  setNumYears: (n: number) => void;
  setNumSimulations: (n: number) => void;
  setStartingValue: (n: number) => void;
  setMinBlock: (n: number) => void;
  setMaxBlock: (n: number) => void;
}): PresetButtonProps[] {
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

function PresetButton({ label, onClick }: PresetButtonProps) {
  return (
    <button className="toolbar-btn" onClick={onClick}>
      {label}
    </button>
  );
}

function PresetsCard({ presets }: { presets: PresetButtonProps[] }) {
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

function MonteCarloSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        本工具使用区块自举法对历史市场数据进行重采样，让您研究大量可能的组合路径，而非仅回放一段固定历史。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可模拟内容</div>
          <div className="bt-seo-feature-desc">
            退休提款策略、定投计划、固定提取方案，观察其在数千条模拟市场路径下的表现与存活概率。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">输出结果</div>
          <div className="bt-seo-feature-desc">
            分布统计表(Summary)、组合价值范围图、成功概率曲线、多指标分布直方图、代表性场景路径。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          组合回测
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          组合优化
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>
          有效前沿
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>
          资产分析
        </Link>
      </div>
    </div>
  );
}

export { buildPresets, PresetsCard, MonteCarloSeoCard };
