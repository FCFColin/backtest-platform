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
import type { ReferenceLine } from '@/components/charts/chartUtils.js';
import ChartCard from '@/components/ChartCard.js';
import { Card, Progress, Input, AffixInput } from '@/components/ui/uiComponents';
import { ResultsShell } from '@/components/resultsShell.js';
import { MetricsGrid } from '@/components/ui/MetricsGrid';
import { Field, FieldLabel } from '@/components/form/Field.js';
import { CollapsibleSection } from '@/components/cards.js';
import {
  SectionHeader,
  PercentInput,
  DollarInput,
  RunButton,
} from '@/components/form/sharedFields';
import SinglePortfolioEditor from '@/components/PortfolioEditor.js';
interface GoalAsset {
  ticker: string;
  weight: number;
}
interface GoalOptimizerState {
  targetAmount: number;
  setTargetAmount: (v: number) => void;
  initialAmount: number;
  setInitialAmount: (v: number) => void;
  years: number;
  setYears: (v: number) => void;
  assets: GoalAsset[];
  maxDrawdown: number | '';
  setMaxDrawdown: (v: number | '') => void;
  maxVolatility: number | '';
  setMaxVolatility: (v: number | '') => void;
  numSimulations: number;
  setNumSimulations: (v: number) => void;
  isLoading: boolean;
  error: string | null;
  results: GoalOptimizerResult | null;
  addAsset: () => void;
  removeAsset: (idx: number) => void;
  updateAsset: (idx: number, field: 'ticker' | 'weight', val: string | number) => void;
  totalWeight: number;
  runOptimize: () => void;
}
function useGoalOptimizerState(t: TFunction): GoalOptimizerState {
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
  const validAssets = assets.filter((a) => a.ticker.trim());
  const {
    isLoading,
    error,
    results,
    runCompute: runOptimize,
  } = useComputeTool<GoalOptimizerResult>(
    async () => {
      const constraints: { maxDrawdown?: number; maxVolatility?: number } = {};
      if (s.maxDrawdown !== '') constraints.maxDrawdown = s.maxDrawdown / 100;
      if (s.maxVolatility !== '') constraints.maxVolatility = s.maxVolatility / 100;
      const res = await apiFetch('/api/v1/goal-optimizer/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAmount: s.targetAmount,
          initialAmount: s.initialAmount,
          years: s.years,
          assets: validAssets,
          constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
          numSimulations: s.numSimulations,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success === false) throw new Error(json.error || i18n.t('Goal optimization failed'));
      return json.data as GoalOptimizerResult;
    },
    () => {
      if (validAssets.length === 0) return t('Please add at least one ticker');
      if (totalWeight !== 100) return t('Total weight must equal 100%');
      if (s.targetAmount <= 0 || s.initialAmount <= 0 || s.years <= 0)
        return t('Target amount, initial amount, and time range must be positive');
      return null;
    },
  );
  return {
    ...s,
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
}
const GRID = { top: 10, right: 20, bottom: 5, left: 60 };
function GoalOptimizerResultsPanel({ state }: { state: GoalOptimizerState }) {
  const { t } = useTranslation();
  const r = state.results;
  const probColor = r
    ? r.successProbability >= 0.7
      ? 'hsl(var(--success))'
      : r.successProbability >= 0.4
        ? getPortfolioColor(1)
        : 'hsl(var(--danger))'
    : '';
  const tc = getPortfolioColor(3);
  const buildTargetRefLines = (axis: 'x' | 'y'): ReferenceLine[] => [
    {
      axis,
      value: state.targetAmount,
      label: t('Target'),
      color: tc,
      dash: 'dashed',
      width: 1.5,
      labelColor: tc,
      labelFontSize: 11,
    },
  ];
  return (
    <ResultsShell
      error={state.error ? `${t('Optimization failed')}: ${state.error}` : null}
      isLoading={state.isLoading}
      hasResults={!!state.results}
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
              style={{ color: probColor }}
            >
              {(r.successProbability * 100).toFixed(1)}%
            </div>
            <Progress value={r.successProbability * 100} className="mt-4 h-2 w-full max-w-xs" />
            <div className="mt-3 text-caption text-fg-tertiary">
              {t('Target {{target}} · Initial {{initial}} · {{years}} years', {
                target: fmtAmount(state.targetAmount),
                initial: fmtAmount(state.initialAmount),
                years: state.years,
              })}
            </div>
          </Card>
          <ChartCard title={t('Final Value Probability Distribution')}>
            <SimpleChart
              type="area"
              data={r.probabilityCurve}
              height={300}
              margin={GRID}
              xDataKey="amount"
              xType="number"
              xTickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
              yTickFormatter={(v: number) => fmtPct(v, 1)}
              tooltipFormatter={(v: number) => [fmtPct(v), t('Probability')]}
              tooltipLabelFormatter={(label) => fmtAmount(Number(label))}
              ariaLabel={t('Final Value Probability Distribution')}
              series={[
                {
                  dataKey: 'probability',
                  name: t('Probability'),
                  color: getPortfolioColor(0),
                  width: 2,
                  smooth: true,
                  areaOpacity: 0.3,
                },
              ]}
              referenceLines={buildTargetRefLines('x')}
            />
          </ChartCard>
          <ChartCard title={t('Optimal Path (Median / P10 / P90)')}>
            <SimpleChart
              data={r.optimalPath}
              height={350}
              margin={GRID}
              xDataKey="year"
              xTickFormatter={(v) => `${v}y`}
              yTickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              tooltipFormatter={(v: number) => [fmtAmount(v), '']}
              tooltipLabelFormatter={(label) => t('Year {{year}}', { year: label })}
              legendPosition="top"
              ariaLabel={t('Optimal Path (Median / P10 / P90)')}
              series={[
                {
                  dataKey: 'p90',
                  name: 'P90',
                  color: getPortfolioColor(2),
                  width: 1.5,
                  smooth: true,
                },
                {
                  dataKey: 'median',
                  name: t('Median'),
                  color: getPortfolioColor(0),
                  width: 2.5,
                  smooth: true,
                },
                {
                  dataKey: 'p10',
                  name: 'P10',
                  color: getPortfolioColor(3),
                  width: 1.5,
                  smooth: true,
                },
              ]}
              referenceLines={buildTargetRefLines('y')}
            />
          </ChartCard>
          <ChartCard title={t('Recommended Configuration')}>
            <MetricsGrid
              columns={3}
              variant="border"
              metrics={[
                {
                  label: t('Expected Annual Return'),
                  value: fmtPct(r.recommendation.expectedReturn),
                },
                {
                  label: t('Required Annual Contribution'),
                  value: fmtAmount(r.recommendation.requiredContribution),
                },
                {
                  label: t('Success Rate'),
                  value: fmtPct(r.recommendation.successRate),
                  color: probColor,
                },
              ]}
            />
          </ChartCard>
        </div>
      )}
    </ResultsShell>
  );
}
function GoalSettingsSection({
  targetAmount,
  initialAmount,
  years,
  setTargetAmount,
  setInitialAmount,
  setYears,
}: Pick<
  GoalOptimizerState,
  'targetAmount' | 'initialAmount' | 'years' | 'setTargetAmount' | 'setInitialAmount' | 'setYears'
>) {
  const { t } = useTranslation();
  const fields = [
    { id: 'go-target', label: t('Target Amount'), value: targetAmount, onChange: setTargetAmount },
    {
      id: 'go-initial',
      label: t('Initial Amount'),
      value: initialAmount,
      onChange: setInitialAmount,
    },
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
        {fields.map((f) => (
          <Field key={f.id}>
            <FieldLabel htmlFor={f.id}>{f.label}</FieldLabel>
            <DollarInput
              id={f.id}
              min={0}
              value={f.value}
              onChange={(e) => f.onChange(Number(e.target.value))}
            />
          </Field>
        ))}
        <Field>
          <FieldLabel htmlFor="go-years">{t('Time Horizon')}</FieldLabel>
          <AffixInput
            id="go-years"
            type="number"
            min={1}
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            suffix={t('y')}
          />
        </Field>
      </div>
    </section>
  );
}
function AssetConfigSection({ state }: { state: GoalOptimizerState }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader
        title={t('Asset Allocation')}
        info={t('Add tickers and weights; total weight must equal 100%')}
      />
      <SinglePortfolioEditor
        singleMode
        assets={state.assets}
        totalWeight={state.totalWeight}
        onAdd={state.addAsset}
        onRemove={state.removeAsset}
        onUpdate={state.updateAsset}
        wrapInSection={false}
      />
    </section>
  );
}
type CP = Pick<
  GoalOptimizerState,
  | 'maxDrawdown'
  | 'maxVolatility'
  | 'numSimulations'
  | 'setMaxDrawdown'
  | 'setMaxVolatility'
  | 'setNumSimulations'
>;
function ConstraintsAndSimulation({
  maxDrawdown,
  maxVolatility,
  numSimulations,
  setMaxDrawdown,
  setMaxVolatility,
  setNumSimulations,
}: CP) {
  const { t } = useTranslation();
  const numOrEmpty = (v: string) => (v === '' ? '' : Number(v));
  const fields = [
    {
      id: 'go-maxdd',
      label: t('Max Drawdown Limit'),
      value: maxDrawdown,
      onChange: setMaxDrawdown,
    },
    { id: 'go-maxvol', label: t('Max Vol'), value: maxVolatility, onChange: setMaxVolatility },
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
          {fields.map((c) => (
            <Field key={c.id}>
              <FieldLabel htmlFor={c.id}>{c.label}</FieldLabel>
              <PercentInput
                id={c.id}
                min={0}
                max={100}
                placeholder={t('No limit')}
                value={c.value}
                onChange={(e) => c.onChange(numOrEmpty(e.target.value))}
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
              value={numSimulations}
              onChange={(e) => setNumSimulations(Number(e.target.value))}
            />
          </Field>
        </div>
      </section>
    </>
  );
}
function GoalOptimizerParamsPanel({ state }: { state: GoalOptimizerState }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-5">
      <GoalSettingsSection {...state} />
      <AssetConfigSection state={state} />
      <ConstraintsAndSimulation {...state} />
      <RunButton
        isLoading={state.isLoading}
        onClick={state.runOptimize}
        label={t('Start Optimization')}
        loadingLabel={t('Optimizing...')}
        size="lg"
      />
    </div>
  );
}
const config: ComputeToolConfig<GoalOptimizerState> = {
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
