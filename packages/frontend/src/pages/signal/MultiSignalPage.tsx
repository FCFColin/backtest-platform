import { ComputeToolShell } from '@/components/shells/index.js';
import type { ComputeToolConfig } from '@/components/shells/index.js';
import { useMultiSignalState } from './hooks/useMultiSignalState.js';
import type { UseMultiSignalStateResult } from './hooks/useMultiSignalState.js';
import { MultiSignalParamsPanel } from './SignalSelector.js';
import { MultiSignalResultsPanel } from './MultiSignalResultsChart.js';
const config: ComputeToolConfig<UseMultiSignalStateResult> = {
  titleKey: 'signal.multi.title',
  paramsTitleKey: 'signal.multi.paramsTitle',
  params: ({ state }) => <MultiSignalParamsPanel state={state} />,
  results: ({ state }) => <MultiSignalResultsPanel results={state.results} error={state.error} isLoading={state.isLoading} />
};
export default function MultiSignalPage() {
  const s = useMultiSignalState();
  return <ComputeToolShell config={config} state={s} />;
}
