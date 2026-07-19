/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTranslation } from 'react-i18next';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';
import { useFactorRegressionState } from '@/hooks/useFactorRegressionState.js';
import { FactorRegressionParamsPanel } from './FactorRegressionParams.js';
import { FactorRegressionResultsPanel } from './FactorRegressionResults.js';

type State = any;

function ParamsWrapper({ state }: { state: State }) {
  return (
    <FactorRegressionParamsPanel
      startDate={state.startDate}
      endDate={state.endDate}
      returnFrequency={state.returnFrequency}
      rfSource={state.rfSource}
      selectedFactors={state.selectedFactors}
      assets={state.assets}
      totalWeight={state.totalWeight}
      isLoading={state.isLoading}
      onStartDateChange={state.setStartDate}
      onEndDateChange={state.setEndDate}
      onReturnFrequencyChange={state.setReturnFrequency}
      onRfSourceChange={state.setRfSource}
      onToggleFactor={state.toggleFactor}
      onAddAsset={state.addAsset}
      onRemoveAsset={state.removeAsset}
      onUpdateAsset={state.updateAsset}
      onRun={state.runRegression}
    />
  );
}

function ResultsWrapper({ state }: { state: State }) {
  return (
    <FactorRegressionResultsPanel
      result={state.result}
      error={state.error}
      selectedFactors={state.selectedFactors}
    />
  );
}

const config: ComputeToolConfig<State> = {
  titleKey: 'factorRegression.title',
  seoDescKey: 'factorRegression.seo.desc',
  seoFeatures: [
    {
      titleKey: 'factorRegression.seo.analyzableTitle',
      descKey: 'factorRegression.seo.analyzableDesc',
    },
    {
      titleKey: 'factorRegression.seo.factorTitle',
      descKey: 'factorRegression.seo.factorDesc',
    },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
    { titleKey: 'nav.rebalancingSensitivity', href: '/rebalancing-sensitivity' },
  ],
  params: ParamsWrapper,
  results: ResultsWrapper,
};

export default function FactorRegressionPage() {
  const { t } = useTranslation();
  const s = useFactorRegressionState(t);
  return <ComputeToolShell config={config} state={s} />;
}
