/**
 * @file 蒙特卡洛模拟页面
 * @description 基于历史收益分布进行蒙特卡洛模拟，展示未来净值区间、成功率及分布统计
 * @route /monte-carlo
 */
import { useTranslation } from 'react-i18next';
import { McParamsPanel } from './MonteCarloParams.js';
import { useMonteCarloState } from './monteCarloParamsUtils.js';
import { MonteCarloResultsPanel } from './MonteCarloResults.js';
import { PresetsCard } from './MonteCarloPresets.js';
import { ToolSeoCard } from '../../components/layout/index.js';
import { buildPresets } from './monteCarloPresetsUtils.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';

export default function MonteCarloPage() {
  const { t } = useTranslation();
  const s = useMonteCarloState();
  const presets = buildPresets(s);
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('monteCarlo.title')}</h1>
      </div>
      <ToolSeoCard
        desc={t('monteCarlo.seoDesc')}
        features={[
          { title: t('monteCarlo.seoSimulatable'), desc: t('monteCarlo.seoSimulatableDesc') },
          { title: t('monteCarlo.seoOutput'), desc: t('monteCarlo.seoOutputDesc') },
        ]}
        related={[
          { title: t('nav.portfolioBacktest'), href: '/' },
          { title: t('nav.portfolioOptimize'), href: '/optimizer' },
          { title: t('nav.efficientFrontier'), href: '/efficient-frontier' },
          { title: t('nav.assetAnalysis'), href: '/analysis' },
        ]}
        relatedLabel={t('monteCarlo.relatedTools')}
      />
      <PresetsCard presets={presets} />
      <ToolPageLayout
        title={t('params.basicParams')}
        params={<McParamsPanel s={s} />}
        results={
          <MonteCarloResultsPanel
            error={s.error}
            results1={s.results1}
            results2={s.results2}
            portfolios={s.portfolios}
            portfolioMode={s.portfolioMode}
            activeTab={s.activeTab}
            setActiveTab={s.setActiveTab}
            startingValue={s.startingValue}
            numSimulations={s.numSimulations}
            distMetric={s.distMetric}
            setDistMetric={s.setDistMetric}
          />
        }
      />
    </div>
  );
}
