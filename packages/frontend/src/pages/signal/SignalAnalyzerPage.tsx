import { ComputeToolShell } from '@/components/shells/index.js';
import type { ComputeToolConfig } from '@/components/shells/index.js';
import {
  useSignalAnalyzerState,
  useDualSignalState,
  useMultiSignalState,
  type UseSignalAnalyzerStateResult,
  type UseDualSignalStateResult,
  type UseMultiSignalStateResult,
} from './signalState.js';
import { SignalAnalyzerParamsPanel, DualSignalParamsPanel } from './SignalParamsPanel.js';
import { MultiSignalParamsPanel } from './SignalSelector.js';
import { SignalAnalyzerResultsPanel, MultiSignalResultsPanel } from './SignalAnalyzerResults.js';
import { DualSignalResultsPanel } from './DualSignalResults.js';
const analyzerConfig: ComputeToolConfig<UseSignalAnalyzerStateResult> = {
  titleKey: 'signal.analyzer.title',
  params: ({ state }) => <SignalAnalyzerParamsPanel state={state} />,
  results: ({ state }) => (
    <SignalAnalyzerResultsPanel
      error={state.error}
      results={state.results}
      isLoading={state.isLoading}
      onRetry={state.runAnalysis}
    />
  ),
};
export default function SignalAnalyzerPage() {
  const s = useSignalAnalyzerState();
  return <ComputeToolShell config={analyzerConfig} state={s} />;
}
const dualConfig: ComputeToolConfig<UseDualSignalStateResult> = {
  titleKey: 'signal.dual.title',
  params: ({ state }) => <DualSignalParamsPanel state={state} />,
  results: ({ state }) => (
    <DualSignalResultsPanel
      results={state.results}
      error={state.error}
      isLoading={state.isLoading}
    />
  ),
};
export function DualSignalPage() {
  const s = useDualSignalState();
  return <ComputeToolShell config={dualConfig} state={s} />;
}
const multiConfig: ComputeToolConfig<UseMultiSignalStateResult> = {
  titleKey: 'signal.multi.title',
  params: ({ state }) => <MultiSignalParamsPanel state={state} />,
  results: ({ state }) => (
    <MultiSignalResultsPanel
      results={state.results}
      error={state.error}
      isLoading={state.isLoading}
    />
  ),
};
export function MultiSignalPage() {
  const s = useMultiSignalState();
  return <ComputeToolShell config={multiConfig} state={s} />;
}
