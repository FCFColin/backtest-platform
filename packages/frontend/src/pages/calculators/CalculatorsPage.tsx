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
import { StandardPageShell } from '../../components/shells/StandardPageShell.js';
import type { StandardPageConfig } from '../../components/shells/types.js';

const config: StandardPageConfig = { titleKey: 'calculators.page.title' };

export default function CalculatorsPage() {
  return (
    <StandardPageShell config={config}>
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
    </StandardPageShell>
  );
}
