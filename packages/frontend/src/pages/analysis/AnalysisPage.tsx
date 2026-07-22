/* eslint-disable @typescript-eslint/no-explicit-any */
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';
import { useAnalysisPageState } from '@/hooks/useAnalysisPageState.js';
import { AnalysisParamsPanel } from './AnalysisParams.js';
import { AnalysisResultsPanel } from './AnalysisResults.js';

type State = any;

function AnalysisParamsWrapper({ state }: { state: State }) {
  return (
    <AnalysisParamsPanel
      tickers={state.tickers}
      setTickers={state.setTickers}
      startDate={state.startDate}
      setStartDate={state.setStartDate}
      endDate={state.endDate}
      setEndDate={state.setEndDate}
      startingValue={state.startingValue}
      setStartingValue={state.setStartingValue}
      rollingWindow={state.rollingWindow}
      setRollingWindow={state.setRollingWindow}
      correlationWindow={state.correlationWindow}
      setCorrelationWindow={state.setCorrelationWindow}
      adjustForInflation={state.adjustForInflation}
      setAdjustForInflation={state.setAdjustForInflation}
      isLoading={state.isLoading}
      runAnalysis={state.runAnalysis}
    />
  );
}

function AnalysisResultsWrapper({ state }: { state: State }) {
  return (
    <AnalysisResultsPanel
      error={state.error}
      results={state.results}
      activeTab={state.activeTab}
      setActiveTab={state.setActiveTab}
      isLoading={state.isLoading}
      correlationWindow={state.correlationWindow}
      rollingWindow={state.rollingWindow}
    />
  );
}

const config: ComputeToolConfig<State> = {
  titleKey: 'analysis.title',
  seoDescKey: 'analysis.seoDesc',
  hideParamsTitle: true,
  seoFeatures: [
    { titleKey: 'analysis.seoAnalyzable', descKey: 'analysis.seoAnalyzableDesc' },
    { titleKey: 'analysis.seoViewable', descKey: 'analysis.seoViewableDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'optimizer.title', href: '/optimizer' },
    { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' },
  ],
  params: AnalysisParamsWrapper,
  results: AnalysisResultsWrapper,
};

export default function AnalysisPage() {
  const s = useAnalysisPageState();
  return <ComputeToolShell config={config} state={s} />;
}
