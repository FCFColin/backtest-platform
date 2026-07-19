/**
 * @file 目标优化器页面
 * @description 基于蒙特卡洛模拟计算达成财务目标的概率，展示概率分布、最优路径与建议配置
 * @route /goal-optimizer
 */
import { useTranslation } from 'react-i18next';
import { ToolSeoCard } from '../../components/layout/index.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { useGoalOptimizerState } from '@/hooks/useGoalOptimizerState.js';
import { GoalOptimizerParamsPanel } from './GoalOptimizerParams.js';
import { GoalOptimizerResultsPanel } from './GoalOptimizerResults.js';

export default function GoalOptimizerPage() {
  const { t } = useTranslation();
  const s = useGoalOptimizerState(t);

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('goalOptimizer.title')}</h1>
      </div>
      <ToolSeoCard
        desc={t('goalOptimizer.seo.desc')}
        features={[
          {
            title: t('goalOptimizer.seo.analyzableTitle'),
            desc: t('goalOptimizer.seo.analyzableDesc'),
          },
          {
            title: t('goalOptimizer.seo.outputTitle'),
            desc: t('goalOptimizer.seo.outputDesc'),
          },
        ]}
        related={[
          { title: t('nav.monteCarlo'), href: '/monte-carlo' },
          { title: t('nav.portfolioOptimize'), href: '/optimizer' },
          { title: t('nav.efficientFrontier'), href: '/efficient-frontier' },
        ]}
      />
      <ToolPageLayout
        title={t('goalOptimizer.paramsTitle')}
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
