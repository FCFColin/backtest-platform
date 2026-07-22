/** 回测优化器页面组合入口：组合 ./backtestOptimizer/ 下的 Section 子组件，导出 OptimizerPageShell。 */
import { Play, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { ToolSeoCard } from '../../components/layout/ToolSeoCard.js';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import { ParamRow, ParamCard } from '../../components/params/index.js';
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
            className="param-input"
            value={s.startDate}
            onChange={(e) => s.setStartDate(e.target.value)}
          />
        </ParamCard>
        <ParamCard label={t('backtest.optimizer.endDate')}>
          <input
            type="date"
            className="param-input"
            value={s.endDate}
            onChange={(e) => s.setEndDate(e.target.value)}
          />
        </ParamCard>
        <ParamCard label={t('backtest.optimizer.benchmarkTicker')}>
          <input
            type="text"
            className="param-input"
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
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)' }}>
          {t('backtest.optimizer.bestCombo')}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {t('backtest.optimizer.totalCombos', { count: totalCombos })}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {metrics.map((m) => (
          <div
            key={m.label}
            style={{
              textAlign: 'center',
              padding: 12,
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-control)',
            }}
          >
            <div style={{ fontSize: 11, marginBottom: 4, color: 'var(--text-muted)' }}>
              {m.label}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                fontFamily: 'monospace',
                color: 'var(--text-body)',
              }}
            >
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </>
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
      <div className="bt-action-row" style={{ padding: '12px 0 4px' }}>
        <button
          onClick={() => void s.runOptimize()}
          disabled={s.isLoading}
          className="main-action-btn"
          style={{ width: '100%' }}
        >
          {s.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {s.isLoading ? t('backtest.optimizer.optimizing') : t('backtest.optimizer.startOptimize')}
        </button>
      </div>
    </ParamsPanel>
  );
}

function OptimizerResults({ s }: OptimizerSectionProps) {
  const { t } = useTranslation();
  if (s.error) {
    return (
      <div style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
        {t('backtest.optimizer.optimizeFailed')}
        {s.error}
      </div>
    );
  }
  if (!s.results) {
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48 }}>
        {t('backtest.optimizer.configHint')}
      </div>
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
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('backtest.optimizer.pageTitle')}</h1>
      </div>
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
