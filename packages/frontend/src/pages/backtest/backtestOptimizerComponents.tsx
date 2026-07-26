/** 回测优化器页面组合入口：组合 ./backtestOptimizer/ 下的 Section 子组件，导出 OptimizerPageShell。基于 shadcn Card / Button + token 类名。 */
import { Play, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { ToolSeoCard } from '../../components/layout/ToolSeoCard.js';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import { ParamRow, ParamCard } from '../../components/params/index.js';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/cards.js';
import { buildBestMetrics } from './backtestOptimizerUtils.js';
import { PortfolioConfigSection } from './backtestOptimizer/PortfolioConfigSection.tsx';
import { ParameterSpaceSection } from './backtestOptimizer/ParameterSpaceSection.tsx';
import { ObjectiveSection } from './backtestOptimizer/ObjectiveSection.tsx';
import { GrowthComparisonChart } from './backtestOptimizer/GrowthComparisonChart.tsx';
import { ComparisonTableSection } from './backtestOptimizer/ComparisonTableSection.tsx';
import type { OptimizerSectionProps, BestMetricsCardProps } from './backtestOptimizer/types.js';

function BacktestRangeSection({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('backtest.optimizer.backtestRange')}
      info={t('backtest.optimizer.backtestRangeInfo')}
    >
      <ParamRow>
        <ParamCard label={t('backtest.optimizer.startDate')}>
          <input
            type="date"
            className="flex h-10 w-full rounded-md bg-input-bg border border-border px-3 py-2 text-body text-fg hover:border-border-strong focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 transition-colors duration-150"
            value={s.startDate}
            onChange={(e) => s.setStartDate(e.target.value)}
          />
        </ParamCard>
        <ParamCard label={t('backtest.optimizer.endDate')}>
          <input
            type="date"
            className="flex h-10 w-full rounded-md bg-input-bg border border-border px-3 py-2 text-body text-fg hover:border-border-strong focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 transition-colors duration-150"
            value={s.endDate}
            onChange={(e) => s.setEndDate(e.target.value)}
          />
        </ParamCard>
        <ParamCard label={t('backtest.optimizer.benchmarkTicker')}>
          <input
            type="text"
            className="flex h-10 w-full rounded-md bg-input-bg border border-border px-3 py-2 text-body text-fg placeholder:text-fg-tertiary hover:border-border-strong focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 transition-colors duration-150"
            value={s.benchmarkTicker}
            onChange={(e) => s.setBenchmarkTicker(e.target.value)}
            placeholder={t('backtest.optimizer.benchmarkPlaceholder')}
          />
        </ParamCard>
      </ParamRow>
    </ParamsSection>
  );
}

function BestMetricsCard({ best, totalCombos }: BestMetricsCardProps) {
  const { t } = useTranslation();
  if (!best) return null;
  const metrics = buildBestMetrics(best);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-body font-semibold text-fg">{t('backtest.optimizer.bestCombo')}</div>
        <span className="text-caption text-fg-tertiary">
          {t('backtest.optimizer.totalCombos', { count: totalCombos })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((m) => (
          <StatCard key={m.label} label={m.label} value={m.value} />
        ))}
      </div>
    </div>
  );
}

function OptimizerParams({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <PortfolioConfigSection s={s} />
      <ParameterSpaceSection s={s} />
      <ObjectiveSection s={s} />
      <BacktestRangeSection s={s} />
      <div className="py-3">
        <Button
          variant="primary"
          className="w-full"
          onClick={() => void s.runOptimize()}
          disabled={s.isLoading}
        >
          {s.isLoading ? <Loader2 className="animate-spin" /> : <Play />}
          {s.isLoading ? t('backtest.optimizer.optimizing') : t('backtest.optimizer.startOptimize')}
        </Button>
      </div>
    </ParamsPanel>
  );
}

function OptimizerResults({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  if (s.error) {
    return (
      <Card className="flex items-center justify-center p-6 text-center text-danger">
        {t('backtest.optimizer.optimizeFailed')}
        {s.error}
      </Card>
    );
  }
  if (!s.results) {
    return (
      <Card className="flex items-center justify-center p-12 text-center text-fg-tertiary">
        {t('backtest.optimizer.configHint')}
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <BestMetricsCard best={s.best} totalCombos={s.totalCombos} />
      <GrowthComparisonChart best={s.best} benchmarkGrowth={s.benchmarkGrowth} />
      <ComparisonTableSection results={s.results} objective={s.objective} />
    </div>
  );
}

export function OptimizerPageShell({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full flex-col gap-3">
      <ToolSeoCard
        desc={t('backtest.optimizer.seoDesc')}
        features={[
          {
            title: t('backtest.optimizer.featureParamSpaceTitle'),
            desc: t('backtest.optimizer.featureParamSpaceDesc'),
          },
          {
            title: t('backtest.optimizer.featureMultiObjectiveTitle'),
            desc: t('backtest.optimizer.featureMultiObjectiveDesc'),
          },
        ]}
      />
      <ToolPageLayout
        title={t('backtest.optimizer.paramSettings')}
        params={<OptimizerParams s={s} />}
        results={<OptimizerResults s={s} />}
      />
    </div>
  );
}
