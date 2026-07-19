import { useLETFSlippageState } from './hooks/useLETFSlippageState.js';
import { LETFParamsPanel } from './LETFSlippageParams.js';
import { LETFResultsPanel } from './LETFSlippageResults.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';
import type { LETFResult } from '@backtest/shared';

interface LETFState {
  letfTicker: string;
  benchmarkTicker: string;
  leverage: number;
  startDate: string;
  endDate: string;
  isLoading: boolean;
  error: string | null;
  results: LETFResult | null;
  setLetfTicker: (t: string) => void;
  setBenchmarkTicker: (t: string) => void;
  setLeverage: (n: number) => void;
  setStartDate: (d: string) => void;
  setEndDate: (d: string) => void;
  runAnalysis: () => void;
}

function LETFParamsWrapper({ state }: { state: LETFState }) {
  return (
    <LETFParamsPanel
      letfTicker={state.letfTicker}
      benchmarkTicker={state.benchmarkTicker}
      leverage={state.leverage}
      startDate={state.startDate}
      endDate={state.endDate}
      isLoading={state.isLoading}
      onLetfTickerChange={state.setLetfTicker}
      onBenchmarkTickerChange={state.setBenchmarkTicker}
      onLeverageChange={state.setLeverage}
      onStartDateChange={state.setStartDate}
      onEndDateChange={state.setEndDate}
      onRun={state.runAnalysis}
    />
  );
}

function LETFResultsWrapper({ state }: { state: LETFState }) {
  return (
    <LETFResultsPanel
      results={state.results}
      error={state.error}
      isLoading={state.isLoading}
      leverage={state.leverage}
    />
  );
}

const config: ComputeToolConfig<LETFState> = {
  titleKey: 'letf.title',
  seoDescKey: 'letf.seo.desc',
  seoFeatures: [
    { titleKey: 'letf.seo.analyzableTitle', descKey: 'letf.seo.analyzableDesc' },
    { titleKey: 'letf.seo.scenarioTitle', descKey: 'letf.seo.scenarioDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
    { titleKey: 'nav.pca', href: '/pca' },
  ],
  params: LETFParamsWrapper,
  results: LETFResultsWrapper,
};

export default function LETFSlippagePage() {
  const s = useLETFSlippageState();
  return <ComputeToolShell config={config} state={s} />;
}
