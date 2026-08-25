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
import * as sf from '@/components/form/sharedFields';
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
  const blank = (): GoalAsset => ({ ticker: '', weight: 0 });
  const al = useAssetList<GoalAsset>([...DEFAULT_60_40_ASSETS], blank, 1);
  const valid = al.assets.filter((a) => a.ticker.trim());
  const ct = useComputeTool<GoalOptimizerResult>(
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
      if (al.totalWeight !== 100) return t('Total weight must equal 100%');
      if (s.targetAmount <= 0 || s.initialAmount <= 0 || s.years <= 0)
        return t('Target amount, initial amount, and time range must be positive');
      return null;
    },
  );
  return { ...s, ...al, ...ct, runOptimize: ct.runCompute };
}
type GoalState = ReturnType<typeof useGoalOptimizerState>;
const G = { top: 10, right: 20, bottom: 5, left: 60 };
const GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';

function GoalOptimizerResultsPanel({ state: s }: { state: GoalState }) {
  const { t } = useTranslation();
  const r = s.results;
  const [c0, c1, c2, c3] = [0, 1, 2, 3].map(getPortfolioColor);
  const p = r?.successProbability;
  const pc = !r ? '' : p! >= 0.7 ? 'hsl(var(--success))' : p! >= 0.4 ? c1 : 'hsl(var(--danger))';
  const b = {
    value: s.targetAmount,
    label: t('Target'),
    color: c3,
    dash: 'dashed' as const,
    width: 1.5,
    labelColor: c3,
    labelFontSize: 11,
  };
  const ref = (axis: 'x' | 'y') => [{ axis, ...b }];
  const rec = r?.recommendation;
  const metrics = rec
    ? [
        { label: t('Expected Annual Return'), value: fmtPct(rec.expectedReturn) },
        { label: t('Required Annual Contribution'), value: fmtAmount(rec.requiredContribution) },
        { label: t('Success Rate'), value: fmtPct(rec.successRate), color: pc },
      ]
    : [];
  const P = t('Probability');
  const s1 = [
    { dataKey: 'probability', name: P, color: c0, width: 2, smooth: true, areaOpacity: 0.3 },
  ];
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
              tooltipFormatter={(v: number) => [fmtPct(v), P]}
              tooltipLabelFormatter={(l) => fmtAmount(Number(l))}
              ariaLabel={t('Final Value Probability Distribution')}
              series={s1}
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
            <MetricsGrid columns={3} variant="border" metrics={metrics} />
          </ChartCard>
        </div>
      )}
    </ResultsShell>
  );
}

function GoalOptimizerParamsPanel({ state: s }: { state: GoalState }) {
  const { t } = useTranslation();
  const ne = (v: string) => (v === '' ? '' : Number(v));
  const money = [
    { id: 'go-target', label: t('Target Amount'), v: s.targetAmount, s: s.setTargetAmount },
    { id: 'go-initial', label: t('Initial Amount'), v: s.initialAmount, s: s.setInitialAmount },
  ];
  const limits = [
    { id: 'go-maxdd', label: t('Max Drawdown Limit'), v: s.maxDrawdown, s: s.setMaxDrawdown },
    { id: 'go-maxvol', label: t('Max Vol'), v: s.maxVolatility, s: s.setMaxVolatility },
  ];
  return (
    <div className="flex flex-col gap-5">
      {/* a11y：SectionHeader 渲染 h3，需页根 h1 锚定标题层级（axe heading-order） */}
      <h1 className="sr-only">{t('nav.goalOptimizer')}</h1>
      <section className="flex flex-col gap-3">
        <sf.SectionHeader
          title={t('Goal Settings')}
          info={t(
            'Set your financial goal: target amount, initial amount, and investment time horizon',
          )}
          variant="label"
        />
        <div className={GRID}>
          {money.map((x) => (
            <Field key={x.id}>
              <FieldLabel htmlFor={x.id}>{x.label}</FieldLabel>
              <sf.DollarInput
                id={x.id}
                min={0}
                value={x.v}
                onChange={(e) => x.s(+e.target.value)}
              />
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="go-years">{t('Time Horizon')}</FieldLabel>
            <AffixInput
              id="go-years"
              type="number"
              min={1}
              value={s.years}
              onChange={(e) => s.setYears(Number(e.target.value))}
              suffix={t('y')}
            />
          </Field>
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <sf.SectionHeader
          title={t('Asset Allocation')}
          info={t('Add tickers and weights; total weight must equal 100%')}
          variant="h2"
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
      <CollapsibleSection
        title={t('Constraints')}
        description={t(
          'Optional: set max drawdown and max volatility constraints; simulation will filter paths that violate them',
        )}
      >
        <div className={GRID}>
          {limits.map((x) => (
            <Field key={x.id}>
              <FieldLabel htmlFor={x.id}>{x.label}</FieldLabel>
              <sf.PercentInput
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
        <sf.SectionHeader
          title={t('Simulation Parameters')}
          info={t(
            'Number of Monte Carlo simulations; more is more accurate but slower (default 1000, max 10000)',
          )}
          variant="h2"
        />
        <div className={GRID}>
          <Field>
            <FieldLabel htmlFor="go-sims">{t('Simulation Count')}</FieldLabel>
            <Input
              id="go-sims"
              type="number"
              min={100}
              max={10000}
              value={s.numSimulations}
              onChange={(e) => s.setNumSimulations(Number(e.target.value))}
            />
          </Field>
        </div>
      </section>
      <sf.RunButton
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
