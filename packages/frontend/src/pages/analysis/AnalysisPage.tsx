/**
 * @file 资产分析页面
 * @description 对单个资产进行多维度分析，包括 Telltale 走势对比、相关性/Beta、滚动指标、风险收益散点及收益分布等
 * @route /analysis
 */
import { useTranslation } from 'react-i18next';
import { ToolSeoCard } from '../../components/layout/index.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { useAnalysisPageState } from '@/hooks/useAnalysisPageState.js';
import { AnalysisParamsPanel } from './AnalysisParams.js';
import { AnalysisResultsPanel } from './AnalysisResults.js';

export default function AnalysisPage() {
  const { t } = useTranslation();
  const s = useAnalysisPageState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('analysis.title')}</h1>
      </div>
      <ToolSeoCard
        desc={t('analysis.seoDesc')}
        features={[
          { title: t('analysis.seoAnalyzable'), desc: t('analysis.seoAnalyzableDesc') },
          { title: t('analysis.seoViewable'), desc: t('analysis.seoViewableDesc') },
        ]}
        related={[
          { title: t('nav.portfolioBacktest'), href: '/' },
          { title: t('optimizer.title'), href: '/optimizer' },
          { title: t('nav.efficientFrontier'), href: '/efficient-frontier' },
        ]}
        relatedLabel={t('analysis.relatedTools')}
      />
      <ToolPageLayout
        title={t('analysis.analysisParams')}
        params={
          <AnalysisParamsPanel
            tickers={s.tickers}
            addTicker={s.addTicker}
            removeTicker={s.removeTicker}
            updateTicker={s.updateTicker}
            startDate={s.startDate}
            setStartDate={s.setStartDate}
            endDate={s.endDate}
            setEndDate={s.setEndDate}
            startingValue={s.startingValue}
            setStartingValue={s.setStartingValue}
            rollingWindow={s.rollingWindow}
            setRollingWindow={s.setRollingWindow}
            correlationWindow={s.correlationWindow}
            setCorrelationWindow={s.setCorrelationWindow}
            adjustForInflation={s.adjustForInflation}
            setAdjustForInflation={s.setAdjustForInflation}
            isLoading={s.isLoading}
            runAnalysis={s.runAnalysis}
          />
        }
        results={
          <AnalysisResultsPanel
            error={s.error}
            results={s.results}
            activeTab={s.activeTab}
            setActiveTab={s.setActiveTab}
            isLoading={s.isLoading}
            correlationWindow={s.correlationWindow}
            rollingWindow={s.rollingWindow}
          />
        }
      />
    </div>
  );
}
