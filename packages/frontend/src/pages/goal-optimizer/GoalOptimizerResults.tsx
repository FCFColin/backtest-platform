import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { GoalOptimizerResult } from '@backtest/shared';
import { fmtPct, fmtAmount } from '@/utils/format';
import { useComputeTool, useAssetList, useSetterState } from '@/hooks/miscHooks.js';
import { apiFetch } from '@/utils/apiClient';
import i18n from '../../i18n/index.js';
import { DEFAULT_60_40_ASSETS } from '@/utils/constants';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { SimpleChart } from '@/components/charts/sharedChartContent.js';
import ChartCard from '@/components/ChartCard.js';
import { Card, Progress, Input, AffixInput } from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell.js';
import { MetricsGrid } from '@/components/ui/MetricsGrid';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { CollapsibleSection } from '@/components/cards.js';
import { SectionHeader, PercentInput } from '@/components/form/sharedFields';
import { DollarInput, RunButton } from '@/components/form/sharedFields';
import SinglePortfolioEditor from '@/components/PortfolioEditor.js';
type GoalAsset = { ticker: string; weight: number };
function useGoalOptimizerState(t: TFunction) {
  const s = useSetterState({
    targetAmount: 1000000,
    initialAmount: 100000,
    years: 20,
    maxDrawdown: '' as number | '',
    maxVolatility: '' as number | '',
    numSimulations: 1000,
  });
  const { assets, addAsset, removeAsset, updateAsset, totalWeight } = useAssetList<GoalAsset>(
    [...DEFAULT_60_40_ASSETS],
    () => ({ ticker: '', weight: 0 }),
    1,
  );
  const valid = assets.filter((a) => a.ticker.trim());
  const {
    isLoading,
    error,
    results,
    runCompute: runOptimize,
  } = useComputeTool<GoalOptimizerResult>(
    async () => {
      const c: { maxDrawdown?: number; maxVolatility?: number } = {};
      if (s.maxDrawdown !== '') c.maxDrawdown = s.maxDrawdown / 100;
      if (s.maxVolatility !== '') c.maxVolatility = s.maxVolatility / 100;
      const res = await apiFetch('/api/v1/goal-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAmount: s.targetAmount,
          initialAmount: s.initialAmount,
          years: s.years,
          assets: valid,
          constraints: Object.keys(c).length ? c : undefined,
          numSimulations: s.numSimulations,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (j.success === false) throw new Error(j.error || i18n.t('Goal optimization failed'));
      return j.data as GoalOptimizerResult;
    },
    () => {
      if (!valid.length) return t('Please add at least one ticker');
      if (totalWeight !== 100) return t('Total weight must equal 100%');
      if (s.targetAmount <= 0 || s.initialAmount <= 0 || s.years <= 0)
        return t('Target amount, initial amount, and time range must be positive');
      return null;
    },
  );
  const o = {
    assets,
    addAsset,
    removeAsset,
    updateAsset,
    totalWeight,
    isLoading,
    error,
    results,
    runOptimize,
  };
  return { ...s, ...o };
}
type GoalState = ReturnType<typeof useGoalOptimizerState>;
const G = { top: 10, right: 20, bottom: 5, left: 60 };
function GoalOptimizerResultsPanel({ state: s }: { state: GoalState }) {
  const { t } = useTranslation();
  const r = s.results;
  const g = getPortfolioColor;
  const c0 = g(0),
    c1 = g(1),
    c2 = g(2),
    c3 = g(3);
  const p = r?.successProbability;
  const pc = !r ? '' : p! >= 0.7 ? 'hsl(var(--success))' : p! >= 0.4 ? c1 : 'hsl(var(--danger))';
  const tc = c3;
  const b = {
    value: s.targetAmount,
    label: t('Target'),
    color: tc,
    dash: 'dashed' as const,
    width: 1.5,
    labelColor: tc,
    labelFontSize: 11,
  };
  const ref = (a: 'x' | 'y') => [{ axis: a, ...b }];
  const rec = r?.recommendation;
  const metrics = rec
    ? [
        { l: t('Expected Annual Return'), v: fmtPct(rec.expectedReturn) },
        { l: t('Required Annual Contribution'), v: fmtAmount(rec.requiredContribution) },
        { l: t('Success Rate'), v: fmtPct(rec.successRate), c: pc },
      ]
    : [];
  const prob = {
    dataKey: 'probability',
    name: t('Probability'),
    color: c0,
    width: 2,
    smooth: true,
    areaOpacity: 0.3,
  };
  const ser2 = [
    { dataKey: 'p90', name: 'P90', color: c2, width: 1.5, smooth: true },
    { dataKey: 'median', name: t('Median'), color: c0, width: 2.5, smooth: true },
    { dataKey: 'p10', name: 'P10', color: c3, width: 1.5, smooth: true },
  ];
  return (
    <ResultsShell
      error={s.error ? `${t('Optimization failed')}: ${s.error}` : null}
      isLoading={s.isLoading}
      hasResults={!!r}
      loadingLabel={t('Optimizing...')}
      emptyTitle={t(
        'Set your goal and asset allocation, then click "Start Optimization" to see results',
      )}
    >
      {r && (
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col items-center px-6 py-8 text-center">
            <div className="text-label text-fg-secondary">{t('Probability of Reaching Goal')}</div>
            <div
              className="mt-2 font-mono tabular-nums text-display font-bold"
              style={{ color: pc }}
            >
              {(r.successProbability * 100).toFixed(1)}%
            </div>
            <Progress value={r.successProbability * 100} className="mt-4 h-2 w-full max-w-xs" />
            <div className="mt-3 text-caption text-fg-tertiary">
              {t('Target {{target}} · Initial {{initial}} · {{years}} years', {
                target: fmtAmount(s.targetAmount),
                initial: fmtAmount(s.initialAmount),
                years: s.years,
              })}
            </div>
          </Card>
          <ChartCard title={t('Final Value Probability Distribution')}>
            <SimpleChart
              type="area"
              data={r.probabilityCurve}
              height={300}
              margin={G}
              xDataKey="amount"
              xType="number"
              xTickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
              yTickFormatter={(v: number) => fmtPct(v, 1)}
              tooltipFormatter={(v: number) => [fmtPct(v), t('Probability')]}
              tooltipLabelFormatter={(l) => fmtAmount(Number(l))}
              ariaLabel={t('Final Value Probability Distribution')}
              series={[prob]}
              referenceLines={ref('x')}
            />
          </ChartCard>
          <ChartCard title={t('Optimal Path (Median / P10 / P90)')}>
            <SimpleChart
              data={r.optimalPath}
              height={350}
              margin={G}
              xDataKey="year"
              xTickFormatter={(v) => `${v}y`}
              yTickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              tooltipFormatter={(v: number) => [fmtAmount(v), '']}
              tooltipLabelFormatter={(l) => t('Year {{year}}', { year: l })}
              legendPosition="top"
              ariaLabel={t('Optimal Path (Median / P10 / P90)')}
              series={ser2}
              referenceLines={ref('y')}
            />
          </ChartCard>
          <ChartCard title={t('Recommended Configuration')}>
            <MetricsGrid
              columns={3}
              variant="border"
              metrics={metrics.map((m) => ({ label: m.l, value: m.v, color: m.c }))}
            />
          </ChartCard>
        </div>
      )}
    </ResultsShell>
  );
}
function GoalSettingsSection({
  targetAmount: ta,
  initialAmount: ia,
  years: y,
  setTargetAmount: sta,
  setInitialAmount: sia,
  setYears: sy,
}: GoalState) {
  const { t } = useTranslation();
  const f = [
    { id: 'go-target', label: t('Target Amount'), v: ta, s: sta },
    { id: 'go-initial', label: t('Initial Amount'), v: ia, s: sia },
  ];
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Goal Settings')}
        info={t(
          'Set your financial goal: target amount, initial amount, and investment time horizon',
        )}
        variant="label"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {f.map((x) => (
          <Field key={x.id}>
            <FieldLabel htmlFor={x.id}>{x.label}</FieldLabel>
            <DollarInput
              id={x.id}
              min={0}
              value={x.v}
              onChange={(e) => x.s(Number(e.target.value))}
            />
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor="go-years">{t('Time Horizon')}</FieldLabel>
          <AffixInput
            id="go-years"
            type="number"
            min={1}
            value={y}
            onChange={(e) => sy(Number(e.target.value))}
            suffix={t('y')}
          />
        </Field>
      </div>
    </section>
  );
}
function AssetConfigSection({ state: s }: { state: GoalState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Asset Allocation')}
        info={t('Add tickers and weights; total weight must equal 100%')}
      />
      <SinglePortfolioEditor
        singleMode
        assets={s.assets}
        totalWeight={s.totalWeight}
        onAdd={s.addAsset}
        onRemove={s.removeAsset}
        onUpdate={s.updateAsset}
        wrapInSection={false}
      />
    </section>
  );
}
function ConstraintsAndSimulation({
  maxDrawdown: dd,
  maxVolatility: vol,
  numSimulations: n,
  setMaxDrawdown: sdd,
  setMaxVolatility: svol,
  setNumSimulations: sn,
}: GoalState) {
  const { t } = useTranslation();
  const ne = (v: string) => (v === '' ? '' : Number(v));
  const f = [
    { id: 'go-maxdd', label: t('Max Drawdown Limit'), v: dd, s: sdd },
    { id: 'go-maxvol', label: t('Max Vol'), v: vol, s: svol },
  ];
  return (
    <>
      <CollapsibleSection
        title={t('Constraints')}
        description={t(
          'Optional: set max drawdown and max volatility constraints; simulation will filter paths that violate them',
        )}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {f.map((x) => (
            <Field key={x.id}>
              <FieldLabel htmlFor={x.id}>{x.label}</FieldLabel>
              <PercentInput
                id={x.id}
                min={0}
                max={100}
                placeholder={t('No limit')}
                value={x.v}
                onChange={(e) => x.s(ne(e.target.value))}
              />
            </Field>
          ))}
        </div>
      </CollapsibleSection>
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={t('Simulation Parameters')}
          info={t(
            'Number of Monte Carlo simulations; more is more accurate but slower (default 1000, max 10000)',
          )}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field>
            <FieldLabel htmlFor="go-sims">{t('Simulation Count')}</FieldLabel>
            <Input
              id="go-sims"
              type="number"
              min={100}
              max={10000}
              value={n}
              onChange={(e) => sn(Number(e.target.value))}
            />
          </Field>
        </div>
      </section>
    </>
  );
}
function GoalOptimizerParamsPanel({ state: s }: { state: GoalState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <GoalSettingsSection {...s} />
      <AssetConfigSection state={s} />
      <ConstraintsAndSimulation {...s} />
      <RunButton
        isLoading={s.isLoading}
        onClick={s.runOptimize}
        label={t('Start Optimization')}
        loadingLabel={t('Optimizing...')}
        size="lg"
      />
    </div>
  );
}
const config: ComputeToolConfig<GoalState> = {
  titleKey: 'goalOptimizer.title',
  seoDescKey: 'goalOptimizer.seo.desc',
  seoFeatures: [
    { titleKey: 'analysis.seoAnalyzable', descKey: 'goalOptimizer.seo.analyzableDesc' },
    { titleKey: 'goalOptimizer.seo.outputTitle', descKey: 'goalOptimizer.seo.outputDesc' },
  ],
  relatedTools: [TOOL_LINKS.monteCarlo, TOOL_LINKS.optimizer, TOOL_LINKS.efficientF],
  hideParamsTitle: true,
  params: GoalOptimizerParamsPanel,
  results: GoalOptimizerResultsPanel,
};
export default function GoalOptimizerPage() {
  const { t } = useTranslation();
  const s = useGoalOptimizerState(t);
  return <ComputeToolShell config={config} state={s} />;
}
