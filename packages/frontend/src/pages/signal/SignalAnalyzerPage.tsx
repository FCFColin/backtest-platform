import { ComputeToolShell } from '@/components/shells/index.js';
import type { ComputeToolConfig } from '@/components/shells/index.js';
import { useSignalAnalyzerState } from './useSignalAnalyzerState.js';
import type { UseSignalAnalyzerStateResult } from './useSignalAnalyzerState.js';
import { SignalAnalyzerParamsPanel } from './SignalAnalyzerParams.js';
import { SignalAnalyzerResultsPanel } from './SignalAnalyzerResults.js';
const config: ComputeToolConfig<UseSignalAnalyzerStateResult> = {
  titleKey: 'signal.analyzer.title',
  paramsTitleKey: 'signal.analyzer.paramsTitle',
  params: ({ state }) => <SignalAnalyzerParamsPanel state={state} />,
  results: ({ state }) => <SignalAnalyzerResultsPanel error={state.error} results={state.results} isLoading={state.isLoading} />
};
export default function SignalAnalyzerPage() {
  const s = useSignalAnalyzerState();
  return <ComputeToolShell config={config} state={s} />;
}
