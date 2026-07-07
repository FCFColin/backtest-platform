/**
 * @file 计算器页面
 * @description 提供多种金融计算工具，包括复利、年化收益、定投等场景的可视化计算
 * @route /calculators
 */
import { Link } from 'react-router-dom';
import {
  CAGRCalculator,
  FutureValueCalculator,
  CAGRAssumptionCalculator,
} from './CAGRCalculators.js';
import {
  LeverageDecayCalculator,
  LeverageETFCalculator,
  KellyLeverageCalculator,
  OptionLeverageCalculator,
} from './LeverageCalculators.js';
import { SWRCalculator, AssetAllocationRiskCalculator } from './SWRAndRiskCalculators.js';
import { TwoFundPortfolioCalculator } from './PortfolioCalculators.js';

export default function CalculatorsPage() {
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">投资计算器</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '8px 0 0' }}>
          快速估算投资参数，纯前端即时计算
        </p>
      </div>

      <div className="bt-seo-card card">
        <p className="bt-seo-desc">
          投资计算器工具集，涵盖CAGR估算、终值计算、杠杆ETF衰减分析、安全提款率估算和资产配置风险评估。
          所有计算均在浏览器端完成，无需后端支持，可快速验证投资假设与参数敏感性。
        </p>
        <div className="bt-seo-features">
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">基础计算</div>
            <div className="bt-seo-feature-desc">
              CAGR估算器、终值计算器（含定投），快速验证投资增长假设。
            </div>
          </div>
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">杠杆与风险</div>
            <div className="bt-seo-feature-desc">
              杠杆ETF衰减估算、安全提款率(SWR)、资产配置风险，评估杠杆与退休规划。
            </div>
          </div>
          <div className="bt-seo-feature">
            <div className="bt-seo-feature-title">高级工具</div>
            <div className="bt-seo-feature-desc">
              Kelly最优杠杆、两基金组合前沿、期权杠杆，对标testfol.io Calculator Suite。
            </div>
          </div>
        </div>
        <div className="bt-seo-related">
          <span className="bt-seo-related-label">相关工具：</span>
          <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
            组合回测
          </Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
            蒙特卡洛
          </Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
            组合优化
          </Link>
          <span style={{ color: 'var(--text-muted)' }}> · </span>
          <Link to="/efficient-frontier" className="link-blue" style={{ fontWeight: 700 }}>
            有效前沿
          </Link>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
          gap: 16,
          padding: '8px',
        }}
      >
        <CAGRCalculator />
        <FutureValueCalculator />
        <LeverageDecayCalculator />
        <SWRCalculator />
        <AssetAllocationRiskCalculator />
        <CAGRAssumptionCalculator />
        <LeverageETFCalculator />
        <KellyLeverageCalculator />
        <TwoFundPortfolioCalculator />
        <OptionLeverageCalculator />
      </div>
    </div>
  );
}
