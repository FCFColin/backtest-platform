/**
 * @file 主成分分析（PCA）页面
 * @description 对多个资产的收益率序列进行主成分分析，展示特征值、累计方差解释率、载荷矩阵与主成分得分
 * @route /pca
 */

import { PCAParamsPanel } from './PCAParams.js';
import { PCAResultsPanel } from './PCAResults.js';
import { usePcaPageState } from './usePcaPageState.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PCAState = any;

function PCAParamsWrapper({ state }: { state: PCAState }) {
  return (
    <PCAParamsPanel
      tickers={state.tickers}
      startDate={state.startDate}
      endDate={state.endDate}
      numComponents={state.numComponents}
      isLoading={state.isLoading}
      onAddTicker={state.addTicker}
      onRemoveTicker={state.removeTicker}
      onUpdateTicker={state.updateTicker}
      onStartDateChange={state.setStartDate}
      onEndDateChange={state.setEndDate}
      onNumComponentsChange={state.setNumComponents}
      onRun={state.runAnalysis}
    />
  );
}

function PCAResultsWrapper({ state }: { state: PCAState }) {
  return (
    <PCAResultsPanel results={state.results} error={state.error} isLoading={state.isLoading} />
  );
}

const config: ComputeToolConfig<PCAState> = {
  titleKey: 'pca.title',
  seoDescKey: 'pca.seo.desc',
  seoFeatures: [
    { titleKey: 'pca.seo.analyzableTitle', descKey: 'pca.seo.analyzableDesc' },
    { titleKey: 'pca.seo.scenarioTitle', descKey: 'pca.seo.scenarioDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
  ],
  params: PCAParamsWrapper,
  results: PCAResultsWrapper,
};

/** 主成分分析页面 */
export default function PCAPage() {
  const s = usePcaPageState();
  return <ComputeToolShell config={config} state={s} />;
}
