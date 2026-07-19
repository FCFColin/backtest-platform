/**
 * @file 计算器页面
 * @description 提供多种金融计算工具，包括复利、年化收益、定投等场景的可视化计算
 * @route /calculators
 */
import { useTranslation } from 'react-i18next';
import { ToolSeoCard } from '../../components/layout/index.js';
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
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('calculators.page.title')}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '8px 0 0' }}>
          {t('calculators.page.subtitle')}
        </p>
      </div>

      <ToolSeoCard
        desc={t('calculators.page.seoDesc')}
        features={[
          {
            title: t('calculators.page.featureBasicTitle'),
            desc: t('calculators.page.featureBasicDesc'),
          },
          {
            title: t('calculators.page.featureLeverageTitle'),
            desc: t('calculators.page.featureLeverageDesc'),
          },
          {
            title: t('calculators.page.featureAdvancedTitle'),
            desc: t('calculators.page.featureAdvancedDesc'),
          },
        ]}
        related={[
          { title: t('nav.portfolioBacktest'), href: '/' },
          { title: t('nav.monteCarlo'), href: '/monte-carlo' },
          { title: t('nav.portfolioOptimize'), href: '/optimizer' },
          { title: t('nav.efficientFrontier'), href: '/efficient-frontier' },
        ]}
      />

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
