import { useTranslation } from 'react-i18next';
import { Grid3x3 } from 'lucide-react';
import { Card, Input } from '@/components/ui/uiComponents';
import { LabeledField, RunButton, SelectField } from '@/components/form/sharedFields';
import { SortableTable, type TableColumn } from '@/components/tables';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart';
import { ResultsShell } from '@/components/resultsShell';
import { fmtPct, fmtNum, fmtAmount } from '@/utils/format';
import { HeatmapView } from '@/components/HeatmapView';
import type { TacticalGridResponse, TopCombinationResult } from './tacticalGridUtils';
import { useTacticalGridState } from '@/hooks/useTacticalGridState.js';
import type { TacticalGridState } from '@/hooks/useTacticalGridState.js';
import { INDICATOR_OPTIONS } from './TacticalUtils';
import {
  OBJECTIVE_OPTIONS,
  type IndicatorType,
  type ObjectiveType,
  type GridParamRange,
} from './tacticalGridUtils';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { ParamSection } from './TacticalSignalEditor';
import { BacktestParamsFields } from './sharedBacktestParams';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';

const RANGE_FIELDS: { key: keyof GridParamRange; label: string; min?: number; step?: number }[] = [
  { key: 'min', label: 'Min' },
  { key: 'max', label: 'Max' },
  { key: 'step', label: 'backtest.optimizer.step', min: 0.1, step: 0.5 },
];

function ParamRangeRow({
  range,
  onChange,
  inputMin,
}: {
  range: GridParamRange;
  onChange: (v: GridParamRange) => void;
  inputMin?: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2">
      {RANGE_FIELDS.map((f) => (
        <Field key={f.key}>
          <FieldLabel>{t(f.label)}</FieldLabel>
          <Input
            type="number"
            aria-label={t(f.label)}
            className="font-mono tabular-nums"
            value={range[f.key]}
            min={f.min ?? inputMin}
            step={f.step}
            onChange={(e) => onChange({ ...range, [f.key]: Number(e.target.value) })}
          />
        </Field>
      ))}
    </div>
  );
}
function SignalGridSection({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { indicator, setIndicator, param1, setParam1, param2, setParam2, paramLabels } = state;
  return (
    <ParamSection title={t('Signal Parameter Grid')}>
      <div className="flex flex-col gap-3">
        <SelectField
          label={t('Technical Indicator')}
          value={indicator}
          onChange={(v) => setIndicator(v as IndicatorType)}
          options={INDICATOR_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
        />
        <Field>
          <FieldLabel>{paramLabels.p1}</FieldLabel>
          <ParamRangeRow range={param1} onChange={setParam1} inputMin={1} />
        </Field>
        <Field>
          <FieldLabel>{paramLabels.p2}</FieldLabel>
          <ParamRangeRow range={param2} onChange={setParam2} />
        </Field>
        <FieldDescription>
          {indicator === 'rsi'
            ? t('Enter when RSI falls below oversold threshold, exit when above 100-threshold')
            : t(
                'Enter when price breaks through MA±threshold%, exit when falls below MA∓threshold%',
              )}
        </FieldDescription>
      </div>
    </ParamSection>
  );
}
function GridBacktestParamsSection({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { ticker, setTicker } = state;
  return (
    <BacktestParamsFields idPrefix="grid" state={state}>
      <LabeledField htmlFor="grid-ticker" label={t('Ticker')}>
        <Input
          id="grid-ticker"
          type="text"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder={t('e.g. SPY')}
        />
      </LabeledField>
    </BacktestParamsFields>
  );
}
function GridParamsPanel({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { objective, setObjective, isLoading, runSearch } = state;
  return (
    <div className="flex flex-col gap-4">
      <SignalGridSection state={state} />
      <GridBacktestParamsSection state={state} />
      <ParamSection title={t('Objective')}>
        <SelectField
          label={t('Objective')}
          value={objective}
          onChange={(v) => setObjective(v as ObjectiveType)}
          options={OBJECTIVE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
        />
      </ParamSection>
      <RunButton
        isLoading={isLoading}
        onClick={runSearch}
        label={t('Start Grid Search')}
        loadingLabel={t('Searching...')}
      />
    </div>
  );
}
type ParamLabels = { p1: string; p2: string };
type GridSectionProps = { results: TacticalGridResponse; paramLabels: ParamLabels };
type StatTone = 'brand' | 'success' | 'default';
const TONE_CLASS: Record<StatTone, string> = {
  brand: 'text-brand',
  success: 'text-success',
  default: 'text-fg',
};
function ResultsSummary({ results, paramLabels }: GridSectionProps) {
  const { t } = useTranslation();
  const b = results.bestCombination;
  const stats: Array<{ label: string; value: string | number; tone?: StatTone }> = [
    { label: t('Combinations'), value: results.totalCombinations },
    { label: t('Best {{label}}', { label: paramLabels.p1 }), value: b?.param1 ?? '—' },
    { label: t('Best {{label}}', { label: paramLabels.p2 }), value: b?.param2 ?? '—' },
    { label: t('Best CAGR'), value: b ? fmtPct(b.cagr) : '—', tone: 'success' },
    { label: t('Best Sharpe'), value: b ? fmtNum(b.sharpe, 3) : '—', tone: 'success' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-border-subtle bg-input-bg/30 px-3 py-2.5"
        >
          <div className="text-caption text-fg-tertiary">{s.label}</div>
          <div
            className={`mt-0.5 font-mono text-h2 tabular-nums ${TONE_CLASS[s.tone ?? 'default']}`}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
type RankedResult = TopCombinationResult & { rank: number };
function buildTopColumns(
  t: (k: string) => string,
  paramLabels: ParamLabels,
): TableColumn<RankedResult>[] {
  const num = (v: number | string) => <span className="font-mono tabular-nums">{v}</span>;
  const col = (
    key: keyof RankedResult,
    label: string,
    fmt?: (v: number) => string | number,
  ): TableColumn<RankedResult> => ({
    key,
    label,
    sortValue: (r) => r[key] as number,
    render: (r) => num(fmt ? fmt(r[key] as number) : (r[key] as number)),
  });
  return [
    col('rank', '#'),
    col('param1', paramLabels.p1),
    col('param2', paramLabels.p2),
    col('cagr', t('stats.cagr'), fmtPct),
    col('maxDrawdown', t('Max Drawdown'), fmtPct),
    col('sharpe', 'Sharpe', (v) => fmtNum(v, 3)),
    col('stdev', t('Volatility'), fmtPct),
    col('calmar', 'Calmar', (v) => fmtNum(v, 3)),
    col('totalReturn', t('stats.totalReturn'), fmtPct),
  ];
}
function TopCombinationsTable({ results, paramLabels }: GridSectionProps) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">
        {t('Top {{count}} Combinations', { count: results.topResults.length })}
      </h3>
      <SortableTable
        columns={buildTopColumns(t, paramLabels)}
        data={(results.topResults ?? []).map((r, i) => ({ ...r, rank: i + 1 }))}
        initialSortKey="rank"
        initialSortDir="asc"
      />
    </Card>
  );
}
function BestGrowthChart({ results, paramLabels }: GridSectionProps) {
  const { t } = useTranslation();
  const best = results.bestCombination;
  if (!best || best.growthCurve.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-h3 text-fg">
        {t('Best Combination Growth Curve ({{p1Label}}={{p1}}, {{p2Label}}={{p2}})', {
          p1Label: paramLabels.p1,
          p1: best.param1,
          p2Label: paramLabels.p2,
          p2: best.param2,
        })}
      </h3>
      <TimeSeriesLineChart
        data={best.growthCurve}
        height={350}
        tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
        tooltipValueFormatter={(value) => [fmtAmount(value), t('Net Value')]}
        series={[{ dataKey: 'value', legendName: t('Portfolio Net Value') }]}
      />
    </Card>
  );
}
function GridResultsPanel({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { error, results, isLoading, paramLabels } = state;
  return (
    <ResultsShell
      error={error}
      errorPrefix={`${t('Search failed')}: `}
      isLoading={isLoading}
      hasResults={!!results}
      emptyTitle={t('Set parameters above and click "Start Grid Search" to see results')}
      emptyIcon={Grid3x3}
      onRetry={state.runSearch}
    >
      {results && (
        <div className="flex flex-col gap-3">
          <ResultsSummary results={results} paramLabels={paramLabels} />
          {results.heatmap.matrix.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-3 text-h3 text-fg">
                {t('Parameter Heatmap ({{p1Label}} × {{p2Label}})', {
                  p1Label: results.heatmap.param1Label,
                  p2Label: results.heatmap.param2Label,
                })}
              </h3>
              <HeatmapView heatmap={results.heatmap} />
            </Card>
          )}
          <TopCombinationsTable results={results} paramLabels={paramLabels} />
          <BestGrowthChart results={results} paramLabels={paramLabels} />
        </div>
      )}
    </ResultsShell>
  );
}
const gridConfig: ComputeToolConfig<TacticalGridState> = {
  titleKey: 'tacticalGrid.title',
  params: GridParamsPanel,
  results: GridResultsPanel,
};
export function TacticalGridPage() {
  const { t } = useTranslation();
  const s = useTacticalGridState(t);
  return <ComputeToolShell config={gridConfig} state={s} />;
}
