import { GoalOptimizerParamsPanel } from '../components/goalOptimizer/GoalOptimizerParams.js';
import { GoalOptimizerResultsPanel } from '../components/goalOptimizer/GoalOptimizerResults.js';
import { GoalOptimizerSeoCard } from '../components/goalOptimizer/GoalOptimizerPresets.js';
import { useGoalOptimizerState } from '../hooks/useGoalOptimizerState.js';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';

export default function GoalOptimizerPage() {
  const s = useGoalOptimizerState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">目标优化器</h1>
      </div>
      <GoalOptimizerSeoCard />
      <ToolPageLayout
        title="目标优化参数"
        params={
          <GoalOptimizerParamsPanel
            targetAmount={s.targetAmount}
            initialAmount={s.initialAmount}
            years={s.years}
            assets={s.assets}
            maxDrawdown={s.maxDrawdown}
            minSuccessRate={s.minSuccessRate}
            maxVolatility={s.maxVolatility}
            numSimulations={s.numSimulations}
            totalWeight={s.totalWeight}
            isLoading={s.isLoading}
            onTargetAmountChange={s.setTargetAmount}
            onInitialAmountChange={s.setInitialAmount}
            onYearsChange={s.setYears}
            onAddAsset={s.addAsset}
            onRemoveAsset={s.removeAsset}
            onUpdateAsset={s.updateAsset}
            onMaxDrawdownChange={s.setMaxDrawdown}
            onMinSuccessRateChange={s.setMinSuccessRate}
            onMaxVolatilityChange={s.setMaxVolatility}
            onNumSimulationsChange={s.setNumSimulations}
            onRun={s.runOptimize}
          />
        }
        results={
          <GoalOptimizerResultsPanel
            results={s.results}
            error={s.error}
            isLoading={s.isLoading}
            targetAmount={s.targetAmount}
            initialAmount={s.initialAmount}
            years={s.years}
          />
        }
      />
    </div>
  );
}
