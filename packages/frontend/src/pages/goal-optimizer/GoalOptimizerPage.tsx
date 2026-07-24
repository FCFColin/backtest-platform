/**
 * @file 目标优化器（Goal Optimizer）页面入口
 * @description 通过 ComputeToolShell（内部包 ToolPageLayout）渲染参数面板与结果面板。
 *   hideParamsTitle 让参数卡片保持 testfol.io 风格的极简外观。
 */
import { useTranslation } from 'react-i18next';
import { useGoalOptimizerState } from '@/hooks/useGoalOptimizerState.js';
import { GoalOptimizerParamsPanel } from './GoalOptimizerParams.js';
import { GoalOptimizerResultsPanel } from './GoalOptimizerResults.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';

/** 目标优化器状态类型：由 hook 返回值推导，避免重复声明。 */
type GOState = ReturnType<typeof useGoalOptimizerState>;

/** 参数面板适配器：将状态对象解构为 GoalOptimizerParamsPanel 的细粒度 props。 */
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

/** 结果面板适配器：将状态对象解构为 GoalOptimizerResultsPanel 的 props。 */
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
  hideParamsTitle: true,
  params: GOParamsWrapper,
  results: GOResultsWrapper,
};

/** 目标优化器页面：组装状态并交给 ComputeToolShell 渲染。 */
export default function GoalOptimizerPage() {
  const { t } = useTranslation();
  const s = useGoalOptimizerState(t);
  return <ComputeToolShell config={config} state={s} />;
}
