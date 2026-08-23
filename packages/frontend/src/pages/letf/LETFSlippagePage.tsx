/* eslint-disable react-refresh/only-export-components */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { LETFResult } from '@backtest/shared';
import { Input } from '@/components/ui/uiComponents';
import { Field, FieldLabel } from '@/components/form/Field';
import { LabeledField, RunButton, DateField } from '@/components/form/sharedFields';
import { cn } from '@/lib/utils';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { fmtPct } from '@/utils/format';
import { ResultsShell } from '@/components/resultsShell.js';
import { TimeSeriesLineChart } from '@/components/charts/TimeSeriesLineChart.js';
import ChartCard from '../../components/ChartCard.js';
import { SortableTable, type TableColumn } from '../../components/tables.js';
import { MetricsGrid } from '@/components/ui/MetricsGrid';
import { createComputeToolPage } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
import { useSetterState, useComputeTool } from '../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../i18n/index.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

type CurvePoint = Record<string, number | string | null> & { date: string };
type SlipPoint = CurvePoint & { cumulative: number; daily: number };
type LevPoint = CurvePoint & { effective: number | null; nominal: number };
type StatRow = { metric: string; value: number };

const NEG = 'hsl(var(--danger))';
const negColor = (v: number) => (v < 0 ? NEG : undefined);

function LETFKpiCards({ results: r }: { results: LETFResult }) {
  const { t } = useTranslation();
  const st = r.stats;
  return (
    <MetricsGrid
      metrics={[
        { label: t('Annual Decay'), value: fmtPct(r.annualDecay), color: negColor(r.annualDecay) },
        { label: t('Benchmark Return'), value: fmtPct(st.benchmarkReturn) },
        { label: t('LETF Return'), value: fmtPct(st.letfReturn) },
        { label: t('Total Slippage'), value: fmtPct(st.slippage), color: negColor(st.slippage) },
      ]}
    />
  );
}

function SlippageCurveChart({ data }: { data: SlipPoint[] }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('Slippage Curve')}>
      <TimeSeriesLineChart
        data={data}
        height={350}
        yTickFormatter={(v: number) => `${v.toFixed(1)}%`}
        tooltipValueFormatter={(v: number) => [`${v.toFixed(2)}%`, '']}
        tooltipLabelFormatter={(label: string) => t('Date: {{date}}', { date: label })}
        referenceY={0}
        series={[
          { dataKey: 'cumulative', legendName: t('Cumulative Slippage'), strokeWidth: 2 },
          {
            dataKey: 'daily',
            legendName: t('Daily Slippage'),
            strokeWidth: 1,
            strokeOpacity: 0.6,
            activeDotR: 3,
          },
        ]}
      />
    </ChartCard>
  );
}

function LeverageComparisonChart({ data, leverage }: { data: LevPoint[]; leverage: number }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('Effective vs Nominal Leverage')}>
      <TimeSeriesLineChart
        data={data}
        height={300}
        yTickFormatter={(v: number) => `${v.toFixed(1)}x`}
        tooltipValueFormatter={(v: number) => [`${v.toFixed(2)}x`, '']}
        tooltipLabelFormatter={(label: string) => t('Date: {{date}}', { date: label })}
        series={[
          {
            dataKey: 'nominal',
            legendName: t('Nominal Leverage ({{leverage}}x)', { leverage }),
            color: 'hsl(var(--fg-tertiary))',
            strokeWidth: 1.5,
            strokeDasharray: '6 3',
          },
          {
            dataKey: 'effective',
            legendName: t('Effective Leverage'),
            color: getPortfolioColor(2),
            strokeWidth: 1.5,
            activeDotR: 3,
            connectNulls: true,
          },
        ]}
      />
    </ChartCard>
  );
}

const statRows = (r: LETFResult): StatRow[] => [
  { metric: 'Benchmark Return', value: r.stats.benchmarkReturn },
  { metric: 'LETF Return', value: r.stats.letfReturn },
  { metric: 'Expected Return', value: r.stats.expectedReturn },
  { metric: 'letf.stats.slippage', value: r.stats.slippage },
  { metric: 'letf.stats.annualDecay', value: r.annualDecay },
];

const statCols = (t: TFunction): TableColumn<StatRow>[] => [
  { key: 'metric', label: t('Metric'), render: (x) => t(x.metric), sortValue: (x) => t(x.metric) },
  {
    key: 'value',
    label: t('Value'),
    sortValue: (x) => x.value,
    render: (x) => (
      <span className="font-mono font-semibold tabular-nums text-fg">{fmtPct(x.value)}</span>
    ),
  },
];

function LETFStatsTable({ results: r }: { results: LETFResult }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('Comparison Statistics')}>
      <SortableTable
        columns={statCols(t)}
        data={statRows(r)}
        initialSortKey="value"
        initialSortDir="desc"
      />
    </ChartCard>
  );
}

function LETFResultsPanel({ state: s }: { state: LETFState }) {
  const { t } = useTranslation();
  const r = s.results;
  const slipPts: SlipPoint[] = !r
    ? []
    : r.slippageCurve.map((p, i) => ({
        date: p.date,
        cumulative: +(p.slippage * 100).toFixed(4),
        daily: +((p.slippage - (i ? r.slippageCurve[i - 1].slippage : 0)) * 100).toFixed(4),
      }));
  const levPts: LevPoint[] = !r
    ? []
    : r.slippageCurve.map((p, i) => {
        const lev = r.effectiveLeverage[i];
        return {
          date: p.date,
          effective: lev == null || isNaN(lev) ? null : +lev.toFixed(3),
          nominal: s.leverage,
        };
      });
  return (
    <ResultsShell
      error={s.error}
      isLoading={s.isLoading}
      hasResults={!!r}
      errorPrefix={t('Analysis failed: ')}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
    >
      {r && (
        <div className="flex flex-col gap-4">
          <LETFKpiCards results={r} />
          <SlippageCurveChart data={slipPts} />
          <LeverageComparisonChart data={levPts} leverage={s.leverage} />
          <LETFStatsTable results={r} />
        </div>
      )}
    </ResultsShell>
  );
}

function useLETFSlippageState() {
  const { t } = useTranslation();
  const s = useSetterState({
    letfTicker: 'TQQQ',
    benchmarkTicker: 'QQQ',
    leverage: 3,
    startDate: DEFAULT_START_DATE,
    endDate: DEFAULT_END_DATE,
  });
  const {
    isLoading,
    error,
    results,
    runCompute: runAnalysis,
  } = useComputeTool<LETFResult>(
    () =>
      apiPostJSON<LETFResult>(
        '/api/v1/letf/analyze',
        {
          letfTicker: s.letfTicker.trim(),
          benchmarkTicker: s.benchmarkTicker.trim(),
          leverage: s.leverage,
          startDate: s.startDate,
          endDate: s.endDate,
        },
        i18n.t('LETF slippage analysis failed'),
      ),
    () =>
      s.letfTicker.trim() && s.benchmarkTicker.trim()
        ? null
        : t('Please enter both the leveraged ETF and benchmark index symbols'),
  );
  return { ...s, isLoading, error, results, runAnalysis };
}
type LETFState = ReturnType<typeof useLETFSlippageState>;

const LEV_OPTS = [2, 3] as const;

function LeverageSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex h-10 gap-1.5">
      {LEV_OPTS.map((lev) => (
        <button
          key={lev}
          type="button"
          onClick={() => onChange(lev)}
          className={cn(
            'h-full rounded-md border px-5 text-body font-medium transition-colors duration-150',
            value === lev
              ? 'border-brand bg-brand text-brand-fg'
              : 'border-border bg-input-bg text-fg-secondary hover:bg-hover',
          )}
        >
          {lev}x
        </button>
      ))}
    </div>
  );
}

function LETFParamsPanel({ state: s }: { state: LETFState }) {
  const { t } = useTranslation();
  const letfId = useId(),
    benchId = useId(),
    levId = useId(),
    startId = useId(),
    endId = useId();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <LabeledField htmlFor={letfId} label={t('Leveraged ETF')}>
          <Input
            id={letfId}
            type="text"
            value={s.letfTicker}
            onChange={(e) => s.setLetfTicker(e.target.value)}
            placeholder={t('e.g. TQQQ')}
          />
        </LabeledField>
        <LabeledField htmlFor={benchId} label={t('Benchmark Index')}>
          <Input
            id={benchId}
            type="text"
            value={s.benchmarkTicker}
            onChange={(e) => s.setBenchmarkTicker(e.target.value)}
            placeholder={t('e.g. QQQ')}
          />
        </LabeledField>
        <Field>
          <FieldLabel htmlFor={levId}>{t('Leverage Multiplier')}</FieldLabel>
          <LeverageSelector value={s.leverage} onChange={s.setLeverage} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <DateField
          id={startId}
          label={t('Start Date')}
          value={s.startDate}
          onChange={s.setStartDate}
        />
        <DateField id={endId} label={t('End Date')} value={s.endDate} onChange={s.setEndDate} />
      </div>
      <RunButton
        isLoading={s.isLoading}
        onClick={s.runAnalysis}
        label={t('Run Analysis')}
        loadingLabel={t('Analyzing...')}
      />
    </div>
  );
}

export default createComputeToolPage(useLETFSlippageState, {
  titleKey: 'letf.title',
  seoDescKey: 'letf.seo.desc',
  seoFeatures: [
    { titleKey: 'analysis.seoAnalyzable', descKey: 'letf.seo.analyzableDesc' },
    { titleKey: 'letf.seo.scenarioTitle', descKey: 'letf.seo.scenarioDesc' },
  ],
  relatedTools: [TOOL_LINKS.backtest, TOOL_LINKS.analysis, TOOL_LINKS.pca],
  params: LETFParamsPanel,
  results: LETFResultsPanel,
});
