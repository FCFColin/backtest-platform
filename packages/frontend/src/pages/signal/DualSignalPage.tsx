import { ComputeToolShell } from '@/components/shells/index.js';
import type { ComputeToolConfig } from '@/components/shells/index.js';
import { useDualSignalState } from './useDualSignalState.js';
import type { UseDualSignalStateResult } from './useDualSignalState.js';
import { DualSignalParamsPanel } from './DualSignalParams.js';
import { DualSignalResultsPanel } from './DualSignalResults.js';
const config: ComputeToolConfig<UseDualSignalStateResult> = {
  titleKey: 'signal.dual.title',
  paramsTitleKey: 'signal.dual.paramsTitle',
  params: ({ state }) => <DualSignalParamsPanel state={state} />,
  results: ({ state }) => <DualSignalResultsPanel results={state.results} error={state.error} isLoading={state.isLoading} />
};
export default function DualSignalPage() {
  const s = useDualSignalState();
  return <ComputeToolShell config={config} state={s} />;
}
