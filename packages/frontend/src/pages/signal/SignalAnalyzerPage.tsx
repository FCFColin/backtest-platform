import { ComputeToolShell } from '@/components/shells/index.js';
import type { ComputeToolConfig } from '@/components/shells/index.js';
import { useSignalAnalyzerState } from './useSignalAnalyzerState.js';
import type { UseSignalAnalyzerStateResult } from './useSignalAnalyzerState.js';
import { useDualSignalState } from './useDualSignalState.js';
import type { UseDualSignalStateResult } from './useDualSignalState.js';
import { useMultiSignalState } from './hooks/useMultiSignalState.js';
import type { UseMultiSignalStateResult } from './hooks/useMultiSignalState.js';
import { SignalAnalyzerParamsPanel, DualSignalParamsPanel } from './SignalParamsPanel.js';
import { MultiSignalParamsPanel } from './SignalSelector.js';
import { SignalAnalyzerResultsPanel, MultiSignalResultsPanel } from './SignalAnalyzerResults.js';
import { DualSignalResultsPanel } from './DualSignalResults.js';
const analyzerConfig: ComputeToolConfig<UseSignalAnalyzerStateResult> = {
  titleKey: 'signal.analyzer.title',
  paramsTitleKey: 'rebalancingSensitivity.params.title',
  params: ({ state }) => <SignalAnalyzerParamsPanel state={state} />,
  results: ({ state }) => (
    <SignalAnalyzerResultsPanel
      error={state.error}
      results={state.results}
      isLoading={state.isLoading}
    />
  ),
};
export default function SignalAnalyzerPage() {
  const s = useSignalAnalyzerState();
  return <ComputeToolShell config={analyzerConfig} state={s} />;
}
const dualConfig: ComputeToolConfig<UseDualSignalStateResult> = {
  titleKey: 'signal.dual.title',
  paramsTitleKey: 'rebalancingSensitivity.params.title',
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
  paramsTitleKey: 'rebalancingSensitivity.params.title',
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
