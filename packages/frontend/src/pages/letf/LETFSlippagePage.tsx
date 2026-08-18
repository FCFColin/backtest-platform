import { useId, useMemo, useState } from 'react';
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
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
import { useComputeTool } from '../../hooks/miscHooks.js';
import { apiPostJSON } from '@/utils/apiClient';
import i18n from '../../i18n/index.js';
import { DEFAULT_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
interface SlippageCurveDataPoint extends Record<string, number | string | null> {
  date: string;
  cumulative: number;
  daily: number;
}
interface LeverageComparisonDataPoint extends Record<string, number | string | null> {
  date: string;
  effective: number | null;
  nominal: number;
}
interface LETFResultsProps {
  results: LETFResult | null;
  error: string | null;
  isLoading: boolean;
  leverage: number;
}
function LETFKpiCards({ results }: { results: LETFResult }) {
  const { t } = useTranslation();
  return (
    <MetricsGrid
      metrics={[
        {
          label: t('Annual Decay'),
          value: fmtPct(results.annualDecay),
          color: results.annualDecay < 0 ? 'hsl(var(--danger))' : undefined,
        },
        { label: t('Benchmark Return'), value: fmtPct(results.stats.benchmarkReturn) },
        { label: t('LETF Return'), value: fmtPct(results.stats.letfReturn) },
        {
          label: t('Total Slippage'),
          value: fmtPct(results.stats.slippage),
          color: results.stats.slippage < 0 ? 'hsl(var(--danger))' : undefined,
        },
      ]}
    />
  );
}
function SlippageCurveChart({ data }: { data: SlippageCurveDataPoint[] }) {
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
function LeverageComparisonChart({
  data,
  leverage,
}: {
  data: LeverageComparisonDataPoint[];
  leverage: number;
}) {
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
type StatRow = { metric: string; value: number };
function buildStatColumns(t: TFunction): TableColumn<StatRow>[] {
  return [
    {
      key: 'metric',
      label: t('Metric'),
      render: (r) => t(r.metric),
      sortValue: (r) => t(r.metric),
    },
    {
      key: 'value',
      label: t('Value'),
      sortValue: (r) => r.value,
      render: (r) => (
        <span className="font-mono font-semibold tabular-nums text-fg">{fmtPct(r.value)}</span>
      ),
    },
  ];
}
function buildStatRows(results: LETFResult): StatRow[] {
  return [
    { metric: 'Benchmark Return', value: results.stats.benchmarkReturn },
    { metric: 'LETF Return', value: results.stats.letfReturn },
    { metric: 'Expected Return', value: results.stats.expectedReturn },
    { metric: 'letf.stats.slippage', value: results.stats.slippage },
    { metric: 'letf.stats.annualDecay', value: results.annualDecay },
  ];
}
function LETFStatsTable({ results }: { results: LETFResult }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('Comparison Statistics')}>
      <SortableTable
        columns={buildStatColumns(t)}
        data={buildStatRows(results)}
        initialSortKey="value"
        initialSortDir="desc"
      />
    </ChartCard>
  );
}
function LETFResultsPanel({ results, error, isLoading, leverage }: LETFResultsProps) {
  const { t } = useTranslation();
  const slippageChartData = useMemo<SlippageCurveDataPoint[]>(() => {
    if (!results) return [];
    return results.slippageCurve.map((p, i) => {
      const daily = i === 0 ? p.slippage : p.slippage - results.slippageCurve[i - 1].slippage;
      return {
        date: p.date,
        cumulative: +(p.slippage * 100).toFixed(4),
        daily: +(daily * 100).toFixed(4),
      };
    });
  }, [results]);
  const leverageChartData = useMemo<LeverageComparisonDataPoint[]>(() => {
    if (!results) return [];
    return results.slippageCurve.map((p, i) => {
      const lev = results.effectiveLeverage[i];
      return {
        date: p.date,
        effective: lev == null || isNaN(lev) ? null : +lev.toFixed(3),
        nominal: leverage,
      };
    });
  }, [results, leverage]);
  return (
    <ResultsShell
      error={error}
      isLoading={isLoading}
      hasResults={!!results}
      errorPrefix={t('Analysis failed: ')}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
    >
      {results && (
        <div className="flex flex-col gap-4">
          <LETFKpiCards results={results} />
          <SlippageCurveChart data={slippageChartData} />
          <LeverageComparisonChart data={leverageChartData} leverage={leverage} />
          <LETFStatsTable results={results} />
        </div>
      )}
    </ResultsShell>
  );
}
function useLETFSlippageState() {
  const { t } = useTranslation();
  const [letfTicker, setLetfTicker] = useState('TQQQ');
  const [benchmarkTicker, setBenchmarkTicker] = useState('QQQ');
  const [leverage, setLeverage] = useState(3);
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const {
    isLoading,
    error,
    results,
    runCompute: runAnalysis,
  } = useComputeTool<LETFResult>(
    async () =>
      apiPostJSON<LETFResult>(
        '/api/v1/letf/analyze',
        {
          letfTicker: letfTicker.trim(),
          benchmarkTicker: benchmarkTicker.trim(),
          leverage,
          startDate,
          endDate,
        },
        i18n.t('LETF slippage analysis failed'),
      ),
    () =>
      letfTicker.trim() && benchmarkTicker.trim()
        ? null
        : t('Please enter both the leveraged ETF and benchmark index symbols'),
  );
  return {
    letfTicker,
    benchmarkTicker,
    leverage,
    startDate,
    endDate,
    isLoading,
    error,
    results,
    setLetfTicker,
    setBenchmarkTicker,
    setLeverage,
    setStartDate,
    setEndDate,
    runAnalysis,
  };
}
type LETFState = ReturnType<typeof useLETFSlippageState>;
const LEV_OPTS = [2, 3] as const;
function LeverageSelector({
  leverage,
  onChange,
}: {
  leverage: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex h-10 gap-1.5">
      {LEV_OPTS.map((lev) => (
        <button
          key={lev}
          type="button"
          onClick={() => onChange(lev)}
          className={cn(
            'h-full rounded-md border px-5 text-body font-medium transition-colors duration-150',
            leverage === lev
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
          <LeverageSelector leverage={s.leverage} onChange={s.setLeverage} />
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
function LETFResultsWrapper({ state: s }: { state: LETFState }) {
  return (
    <LETFResultsPanel
      results={s.results}
      error={s.error}
      isLoading={s.isLoading}
      leverage={s.leverage}
    />
  );
}
const config: ComputeToolConfig<LETFState> = {
  titleKey: 'letf.title',
  seoDescKey: 'letf.seo.desc',
  seoFeatures: [
    { titleKey: 'analysis.seoAnalyzable', descKey: 'letf.seo.analyzableDesc' },
    { titleKey: 'letf.seo.scenarioTitle', descKey: 'letf.seo.scenarioDesc' },
  ],
  relatedTools: [TOOL_LINKS.backtest, TOOL_LINKS.analysis, TOOL_LINKS.pca],
  params: LETFParamsPanel,
  results: LETFResultsWrapper,
};
export default function LETFSlippagePage() {
  return <ComputeToolShell config={config} state={useLETFSlippageState()} />;
}
