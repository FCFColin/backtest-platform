import { useTranslation } from 'react-i18next';
import { GridParamsPanel } from './TacticalGridParams.js';
import { GridResultsPanel } from './TacticalGridResults.js';
import { useTacticalGridState } from '@/hooks/useTacticalGridState.js';
import type { TacticalGridState } from '@/hooks/useTacticalGridState.js';
import { ComputeToolShell } from '../../components/shells/index.js';
import type { ComputeToolConfig } from '../../components/shells/index.js';
const config: ComputeToolConfig<TacticalGridState> = {
  titleKey: 'tacticalGrid.title',
  params: GridParamsPanel,
  results: GridResultsPanel
};
export default function TacticalGridPage() {
  const { t } = useTranslation();
  const s = useTacticalGridState(t);
  return <ComputeToolShell config={config} state={s} />;
}
