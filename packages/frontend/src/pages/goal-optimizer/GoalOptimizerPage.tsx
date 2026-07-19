/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTranslation } from 'react-i18next';
import { useGoalOptimizerState } from '@/hooks/useGoalOptimizerState.js';
import { GoalOptimizerParamsPanel } from './GoalOptimizerParams.js';
import { GoalOptimizerResultsPanel } from './GoalOptimizerResults.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';

type GOState = any;

function GOParamsWrapper({ state }: { state: GOState }) {
  return (
    <GoalOptimizerParamsPanel
      targetAmount={state.targetAmount}
      initialAmount={state.initialAmount}
      years={state.years}
      assets={state.assets}
      maxDrawdown={state.maxDrawdown}
      minSuccessRate={state.minSuccessRate}
      maxVolatility={state.maxVolatility}
      numSimulations={state.numSimulations}
      totalWeight={state.totalWeight}
      isLoading={state.isLoading}
      onTargetAmountChange={state.setTargetAmount}
      onInitialAmountChange={state.setInitialAmount}
      onYearsChange={state.setYears}
      onAddAsset={state.addAsset}
      onRemoveAsset={state.removeAsset}
      onUpdateAsset={state.updateAsset}
      onMaxDrawdownChange={state.setMaxDrawdown}
      onMinSuccessRateChange={state.setMinSuccessRate}
      onMaxVolatilityChange={state.setMaxVolatility}
      onNumSimulationsChange={state.setNumSimulations}
      onRun={state.runOptimize}
    />
  );
}

function GOResultsWrapper({ state }: { state: GOState }) {
  return (
    <GoalOptimizerResultsPanel
      results={state.results}
      error={state.error}
      isLoading={state.isLoading}
      targetAmount={state.targetAmount}
      initialAmount={state.initialAmount}
      years={state.years}
    />
  );
}

const config: ComputeToolConfig<GOState> = {
  titleKey: 'goalOptimizer.title',
  seoDescKey: 'goalOptimizer.seo.desc',
  seoFeatures: [
    { titleKey: 'goalOptimizer.seo.analyzableTitle', descKey: 'goalOptimizer.seo.analyzableDesc' },
    { titleKey: 'goalOptimizer.seo.outputTitle', descKey: 'goalOptimizer.seo.outputDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.monteCarlo', href: '/monte-carlo' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' },
  ],
  params: GOParamsWrapper,
  results: GOResultsWrapper,
};

export default function GoalOptimizerPage() {
  const { t } = useTranslation();
  const s = useGoalOptimizerState(t);
  return <ComputeToolShell config={config} state={s} />;
}
