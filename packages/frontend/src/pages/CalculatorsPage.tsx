/**
 * @file 计算器页面
 * @description 提供多种金融计算工具，包括复利、年化收益、定投等场景的可视化计算
 * @route /calculators
 */
import {
  CAGRCalculator,
  FutureValueCalculator,
  LeverageDecayCalculator,
  SWRCalculator,
  AssetAllocationRiskCalculator,
  CAGRAssumptionCalculator,
  LeverageETFCalculator,
  KellyLeverageCalculator,
  TwoFundPortfolioCalculator,
  OptionLeverageCalculator,
} from '../components/calculators/CalculatorsParams.js';
import { CalculatorsSeoCard } from '../components/calculators/CalculatorsPresets.js';

export default function CalculatorsPage() {
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">投资计算器</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '8px 0 0' }}>
          快速估算投资参数，纯前端即时计算
        </p>
      </div>

      <CalculatorsSeoCard />

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
