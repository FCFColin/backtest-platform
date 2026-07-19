/**
 * @file 主成分分析（PCA）页面
 * @description 对多个资产的收益率序列进行主成分分析，展示特征值、累计方差解释率、载荷矩阵与主成分得分
 * @route /pca
 */
import { useTranslation } from 'react-i18next';
import { ToolSeoCard } from '../../components/layout/index.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { PCAParamsPanel } from './PCAParams.js';
import { PCAResultsPanel } from './PCAResults.js';
import { usePcaPageState } from './usePcaPageState.js';

/** 主成分分析页面 */
export default function PCAPage() {
  const { t } = useTranslation();
  const {
    tickers,
    startDate,
    endDate,
    numComponents,
    isLoading,
    error,
    results,
    addTicker,
    removeTicker,
    updateTicker,
    setStartDate,
    setEndDate,
    setNumComponents,
    runAnalysis,
  } = usePcaPageState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('pca.title')}</h1>
      </div>
      <ToolSeoCard
        desc={t('pca.seo.desc')}
        features={[
          {
            title: t('pca.seo.analyzableTitle'),
            desc: t('pca.seo.analyzableDesc'),
          },
          {
            title: t('pca.seo.scenarioTitle'),
            desc: t('pca.seo.scenarioDesc'),
          },
        ]}
        related={[
          { title: t('nav.portfolioBacktest'), href: '/' },
          { title: t('nav.assetAnalysis'), href: '/analysis' },
          { title: t('nav.portfolioOptimize'), href: '/optimizer' },
        ]}
      />
      <ToolPageLayout
        title={t('pca.paramsTitle')}
        params={
          <PCAParamsPanel
            tickers={tickers}
            startDate={startDate}
            endDate={endDate}
            numComponents={numComponents}
            isLoading={isLoading}
            onAddTicker={addTicker}
            onRemoveTicker={removeTicker}
            onUpdateTicker={updateTicker}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onNumComponentsChange={setNumComponents}
            onRun={runAnalysis}
          />
        }
        results={<PCAResultsPanel results={results} error={error} isLoading={isLoading} />}
      />
    </div>
  );
}
