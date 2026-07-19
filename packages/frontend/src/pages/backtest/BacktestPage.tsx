/* eslint-disable @typescript-eslint/no-explicit-any */
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';
import BacktestParamsForm from '@/components/BacktestParamsForm';
import PortfolioEditor from '@/components/PortfolioEditor';
import { useBacktestPageState } from './hooks/useBacktestPageState.js';
import { BacktestToolbar } from './BacktestToolbar.tsx';
import { ResultsContent } from './BacktestResults.tsx';

function BacktestParamsWrapper({ state }: { state: any }) {
  return (
    <>
      <BacktestParamsForm />
      <PortfolioEditor />
      <BacktestToolbar
        runBacktest={state.runBacktest}
        showSaveInput={state.showSaveInput}
        setShowSaveInput={state.setShowSaveInput}
        configName={state.configName}
        setConfigName={state.setConfigName}
        handleSaveConfig={state.handleSaveConfig}
        showLoadList={state.showLoadList}
        handleOpenLoadList={state.handleOpenLoadList}
        savedConfigs={state.savedConfigs}
        handleLoadConfig={state.handleLoadConfig}
        handleDeleteConfig={state.handleDeleteConfig}
        handleShareLink={state.handleShareLink}
      />
    </>
  );
}

function BacktestResultsWrapper(_: { state: any }) {
  return <ResultsContent />;
}

const config: ComputeToolConfig<any> = {
  titleKey: 'backtest.title',
  seoDescKey: 'backtest.seoDesc',
  seoFeatures: [
    { titleKey: 'backtest.seoModelable', descKey: 'backtest.seoModelableDesc' },
    { titleKey: 'backtest.seoViewable', descKey: 'backtest.seoViewableDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.monteCarlo', href: '/monte-carlo' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
  ],
  params: BacktestParamsWrapper,
  results: BacktestResultsWrapper,
};

export default function BacktestPage() {
  const state = useBacktestPageState();
  return <ComputeToolShell config={config} state={state} />;
}
