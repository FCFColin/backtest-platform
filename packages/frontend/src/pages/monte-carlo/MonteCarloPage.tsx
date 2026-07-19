import { useMonteCarloState } from './monteCarloParamsUtils.js';
import { McParamsPanel } from './MonteCarloParams.js';
import { MonteCarloResultsPanel } from './MonteCarloResults.js';
import { buildPresets } from './monteCarloPresetsUtils.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';
import type { McState } from './monteCarloParamsUtils.js';

function McParamsWrapper({ state }: { state: McState }) {
  return <McParamsPanel s={state} />;
}

function McResultsWrapper({ state }: { state: McState }) {
  return (
    <MonteCarloResultsPanel
      error={state.error}
      results1={state.results1}
      results2={state.results2}
      portfolios={state.portfolios}
      portfolioMode={state.portfolioMode}
      activeTab={state.activeTab}
      setActiveTab={state.setActiveTab}
      startingValue={state.startingValue}
      numSimulations={state.numSimulations}
      distMetric={state.distMetric}
      setDistMetric={state.setDistMetric}
    />
  );
}

const config: ComputeToolConfig<McState> = {
  titleKey: 'monteCarlo.title',
  seoDescKey: 'monteCarlo.seoDesc',
  seoFeatures: [
    { titleKey: 'monteCarlo.seoSimulatable', descKey: 'monteCarlo.seoSimulatableDesc' },
    { titleKey: 'monteCarlo.seoOutput', descKey: 'monteCarlo.seoOutputDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
  ],
  presets: buildPresets,
  params: McParamsWrapper,
  results: McResultsWrapper,
};

export default function MonteCarloPage() {
  const s = useMonteCarloState();
  return <ComputeToolShell config={config} state={s} />;
}
