/**
 * @file 计算器聚合页面
 * @description 以 testfol.io 风格的卡片网格陈列全部计算器：ToolPageLayout 包裹响应式网格。
 */
import { useTranslation } from 'react-i18next';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
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
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-6 pb-4">
      <h1 className="text-display text-fg">{t('calculators.page.title')}</h1>
      <ToolPageLayout
        params={
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
        }
      />
    </div>
  );
}
