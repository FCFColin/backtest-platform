/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTranslation } from 'react-i18next';
import { GridParamsPanel } from './TacticalGridParams.js';
import { GridResultsPanel } from './TacticalGridResults.js';
import { useTacticalGridState } from '@/hooks/useTacticalGridState.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';

function GridParamsWrapper({ state }: { state: any }) {
  return <GridParamsPanel state={state} />;
}

function GridResultsWrapper({ state }: { state: any }) {
  return <GridResultsPanel state={state} />;
}

const config: ComputeToolConfig<any> = {
  titleKey: 'tacticalGrid.title',
  params: GridParamsWrapper,
  results: GridResultsWrapper,
};

export default function TacticalGridPage() {
  const { t } = useTranslation();
  const s = useTacticalGridState(t);
  return <ComputeToolShell config={config} state={s} />;
}
