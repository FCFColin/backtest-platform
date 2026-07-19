/**
 * @file 因子回归页面
 * @description 对投资组合进行因子回归分析（如 CAPM、Fama-French 三因子），展示 Alpha、Beta 及 R² 等结果
 * @route /factor-regression
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ToolSeoCard } from '../../components/layout/index.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { useFactorRegressionState } from '@/hooks/useFactorRegressionState.js';
import { FactorRegressionParamsPanel } from './FactorRegressionParams.js';
import { FactorRegressionResultsPanel } from './FactorRegressionResults.js';

function buildFactorRegressionSeoProps(t: TFunction) {
  return {
    desc: t('factorRegression.seo.desc'),
    features: [
      {
        title: t('factorRegression.seo.analyzableTitle'),
        desc: t('factorRegression.seo.analyzableDesc'),
      },
      {
        title: t('factorRegression.seo.factorTitle'),
        desc: t('factorRegression.seo.factorDesc'),
      },
    ],
    related: [
      { title: t('nav.portfolioBacktest'), href: '/' },
      { title: t('nav.assetAnalysis'), href: '/analysis' },
      { title: t('nav.rebalancingSensitivity'), href: '/rebalancing-sensitivity' },
    ],
  };
}

export default function FactorRegressionPage() {
  const { t } = useTranslation();
  const s = useFactorRegressionState(t);

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('factorRegression.title')}</h1>
      </div>
      <ToolSeoCard {...buildFactorRegressionSeoProps(t)} />
      <ToolPageLayout
        title={t('factorRegression.paramsTitle')}
        params={
          <FactorRegressionParamsPanel
            startDate={s.startDate}
            endDate={s.endDate}
            returnFrequency={s.returnFrequency}
            rfSource={s.rfSource}
            selectedFactors={s.selectedFactors}
            assets={s.assets}
            totalWeight={s.totalWeight}
            isLoading={s.isLoading}
            onStartDateChange={s.setStartDate}
            onEndDateChange={s.setEndDate}
            onReturnFrequencyChange={s.setReturnFrequency}
            onRfSourceChange={s.setRfSource}
            onToggleFactor={s.toggleFactor}
            onAddAsset={s.addAsset}
            onRemoveAsset={s.removeAsset}
            onUpdateAsset={s.updateAsset}
            onRun={s.runRegression}
          />
        }
        results={
          <FactorRegressionResultsPanel
            result={s.result}
            error={s.error}
            selectedFactors={s.selectedFactors}
          />
        }
      />
    </div>
  );
}
