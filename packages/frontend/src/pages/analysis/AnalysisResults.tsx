/* eslint-disable react-refresh/only-export-components */
import { useState, memo, lazy, Suspense, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart } from 'lucide-react';
import { type AssetAnalysisResult } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { getColorClass } from '@/components/charts/chartUtils.js';
import { ResultsShell } from '@/components/resultsShell.js';
import * as U from '@/components/ui/uiComponents';
import { Field } from '@/components/form/Field';
import { LabeledField, DollarInput, RunButton, DateField } from '@/components/form/sharedFields';
import { TickerTagInput } from '@/components/form/TickerTagInput.js';
import { AllHistoryCheckbox } from '@/components/params/toolFields.js';
import { useAnalysisData, computePairRollingCorrelation } from '../../hooks/useAnalysisData.js';
import { apiFetch } from '../../utils/apiClient.js';
import { createComputeToolPage, TabFallback } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
import { useComputeTool, useSetterState } from '../../hooks/miscHooks.js';
import { downsample, fmtPct, fmtNum } from '@/utils/format';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import { rowsFromMeta } from '../../components/statistics-table/columns.js';
import type { StatRow } from '../../components/statistics-table/types.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { normalizeTicker } from '@/utils/ticker';
import { lazyNamed } from '@/utils/lazyImport';
import { cn } from '@/lib/utils';
const TABS = [
  { key: 'summary', labelKey: 'tabs.summary' },
  { key: 'telltale', labelKey: 'tabs.telltale' },
  { key: 'correlations', labelKey: 'tabs.correlationsBeta' },
  { key: 'rolling', labelKey: 'tabs.rollingMetrics' },
  { key: 'risk-return', labelKey: 'Risk vs Return' },
  { key: 'returns', labelKey: 'tabs.returns' },
] as const;
const PAGE_DEFAULTS = {
  startDate: DEFAULT_BACKTEST_START_DATE,
  endDate: DEFAULT_END_DATE,
  startingValue: 10000,
  rollingWindow: 12,
  correlationWindow: 12,
  activeTab: 'summary',
};
type FetchCtx = Omit<typeof PAGE_DEFAULTS, 'activeTab'>;
async function fetchAnalysisResult(
  tks: string[],
  ctx: FetchCtx,
  t: (k: string) => string,
): Promise<AssetAnalysisResult> {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), 180_000);
  try {
    const r = await apiFetch('/api/v1/backtest/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: c.signal,
      body: JSON.stringify({
        tickers: tks,
        parameters: {
          startDate: ctx.startDate,
          endDate: ctx.endDate,
          startingValue: ctx.startingValue,
          rollingWindowMonths: ctx.rollingWindow,
          correlationWindowMonths: ctx.correlationWindow,
          baseCurrency: 'usd',
          cashflowLegs: [],
          oneTimeCashflows: [],
        },
      }),
    });
    const j = await r.json().catch(() => {
      throw new Error(
        t('Server response abnormal, please confirm backend service is running and retry'),
      );
    });
    if (!r.ok || j.success === false) {
      const e = j.error as { detail?: unknown } | string | undefined;
      const d =
        (typeof e === 'object' && e !== null && 'detail' in e ? String(e.detail) : '') ||
        (typeof e === 'string' ? e : '');
      throw new Error(d || (!r.ok ? `HTTP ${r.status}` : t('Analysis failed')));
    }
    const raw = (j.data ?? j) as Record<string, unknown>;
    const tickers = (raw.tickers ?? raw.assets ?? []) as AssetAnalysisResult['tickers'];
    for (const x of tickers) {
      if (x.growthCurve?.length > 500) x.growthCurve = downsample(x.growthCurve, 500);
      if (x.drawdownCurve?.length > 500) x.drawdownCurve = downsample(x.drawdownCurve, 500);
    }
    return { tickers, correlations: (raw.correlations ?? []) as number[][] };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError')
      throw new Error(t('Connection timeout, please confirm backend service is running and retry'));
    if (e instanceof TypeError && e.message.includes('fetch'))
      throw new Error(
        t('Network error: unable to connect to server, please confirm backend service is running'),
      );
    throw e instanceof Error ? e : new Error(String(e));
  } finally {
    clearTimeout(id);
  }
}
function useAnalysisPageState() {
  const { t } = useTranslation();
  const [tickers, setTickers] = useState(['SPY', 'TLT', 'GLD']);
  const s = useSetterState(PAGE_DEFAULTS);
  const {
    isLoading,
    error,
    results,
    setResults,
    runCompute: runAnalysis,
  } = useComputeTool<AssetAnalysisResult>(
    () => fetchAnalysisResult(tickers.filter(Boolean).map(normalizeTicker), s, t),
    () => (tickers.filter(Boolean).length ? null : t('Please enter at least one ticker')),
  );
  return { tickers, ...s, isLoading, error, results, setTickers, setResults, runAnalysis };
}
type AnalysisPageState = ReturnType<typeof useAnalysisPageState>;
function AnalysisParamsPanel(p: AnalysisPageState) {
  const { t } = useTranslation();
  const all = p.startDate === '' && p.endDate === '';
  const ds = DEFAULT_BACKTEST_START_DATE;
  const df: [string, string, string, (v: string) => void, string, boolean][] = [
    ['analysis-start-date', 'Start Date', p.startDate, p.setStartDate, ds, all],
    ['analysis-end-date', 'End Date', p.endDate, p.setEndDate, DEFAULT_END_DATE, all],
  ];
  const mf: [string, string, number, (v: number) => void][] = [
    ['analysis-rolling-window', 'Rolling Window', p.rollingWindow, p.setRollingWindow],
    [
      'analysis-correlation-window',
      'Correlation Window',
      p.correlationWindow,
      p.setCorrelationWindow,
    ],
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-end">
      <Field className="sm:col-span-2 lg:col-span-3">
        <TickerTagInput
          tickers={p.tickers.filter(Boolean)}
          onChange={p.setTickers}
          minCount={1}
          placeholder={t('Enter symbol, e.g. SPY')}
        />
      </Field>
      <AllHistoryCheckbox
        startDate={p.startDate}
        endDate={p.endDate}
        onStartDateChange={p.setStartDate}
        onEndDateChange={p.setEndDate}
        label={t('All History')}
      />
      {df.map(([id, lb, v, s, fb, dis]) => (
        <DateField
          key={id}
          id={id}
          label={t(lb)}
          value={v}
          fallback={fb}
          onChange={s}
          disabled={dis}
        />
      ))}
      <LabeledField htmlFor="analysis-starting-value" label={t('Starting Value')}>
        <DollarInput
          id="analysis-starting-value"
          type="number"
          value={p.startingValue}
          onChange={(e) => p.setStartingValue(Number(e.target.value))}
        />
      </LabeledField>
      {mf.map(([id, lb, v, s]) => (
        <LabeledField key={id} htmlFor={id} label={t(lb)}>
          <U.AffixInput
            id={id}
            type="number"
            className="pr-14"
            value={v}
            onChange={(e) => s(Number(e.target.value))}
            suffix={t('months')}
          />
        </LabeledField>
      ))}
      <div className="flex justify-end sm:col-span-1 lg:col-span-2">
        <RunButton
          isLoading={p.isLoading}
          onClick={p.runAnalysis}
          label={t('Run Analysis')}
          loadingLabel={t('Analyzing...')}
          className={cn(U.buttonVariants({ variant: 'primary', size: 'default' }), 'w-auto')}
        />
      </div>
    </div>
  );
}
const LA = (n: string) => lazyNamed(() => import('../../components/charts/analysis.js'), n);
const LT = (n: string) => lazyNamed(() => import('../../components/charts/tables.js'), n);
const LR = (n: string) => lazyNamed(() => import('../../components/charts/rolling.js'), n);
const LRR = (n: string) => lazyNamed(() => import('../../components/charts/riskReturn.js'), n);
const OverviewCharts = LA('OverviewCharts');
const TelltaleChart = LA('TelltaleChart');
const MonthlyHeatmap = LA('MonthlyHeatmap');
const CorrelationMatrixTable = LT('CorrelationMatrixTable');
const BetaMatrixTable = LT('BetaMatrixTable');
const RollingCorrelationChart = LR('RollingCorrelationChart');
const RollingMetricsChart = LR('RollingMetricsChart');
const RiskReturnChart = LRR('RiskReturnChart');
const AnnualReturnChart = lazy(() => import('../../components/charts/AnnualReturnChart.js'));
function CorrelationsBetaTab(p: { results: AssetAnalysisResult; correlationWindow: number }) {
  const tickers = p.results.tickers.map((x) => x.ticker);
  const [pair, setPair] = useState<[number, number]>([0, Math.min(1, tickers.length - 1)]);
  const { betaMatrix } = useAnalysisData(p.results);
  const rollingCorrData = useMemo(
    () => computePairRollingCorrelation(p.results.tickers, pair, p.correlationWindow),
    [p.results, pair, p.correlationWindow],
  );
  return (
    <div className="space-y-6">
      <CorrelationMatrixTable tickers={p.results.tickers} correlations={p.results.correlations} />
      <BetaMatrixTable tickers={tickers} betaMatrix={betaMatrix} />
      {p.results.tickers.length >= 2 && (
        <RollingCorrelationChart
          tickers={tickers}
          rollingPair={pair}
          setRollingPair={setPair}
          rollingCorrData={rollingCorrData}
        />
      )}
    </div>
  );
}
function AnalysisResultsPanel({ state: s }: { state: AnalysisPageState }) {
  const { error, results, activeTab, setActiveTab, isLoading, correlationWindow, rollingWindow } =
    s;
  const { t } = useTranslation();
  const tabMap: Record<(typeof TABS)[number]['key'], (r: AssetAnalysisResult) => ReactNode> = {
    summary: (r) => <OverviewCharts results={r} StatsTable={StatsTable} />,
    telltale: (r) => <TelltaleChart results={r} />,
    correlations: (r) => <CorrelationsBetaTab results={r} correlationWindow={correlationWindow} />,
    rolling: (r) => <RollingMetricsChart results={r} rollingWindow={rollingWindow} />,
    'risk-return': (r) => <RiskReturnChart results={r} />,
    returns: (r) => (
      <div className="space-y-6">
        <AnnualReturnChart results={r} />
        <MonthlyHeatmap results={r} />
      </div>
    ),
  };
  return (
    <ResultsShell
      error={error}
      isLoading={isLoading}
      hasResults={!!results}
      errorPrefix={`${t('Analysis failed')}: `}
      loadingLabel={t('Analyzing...')}
      emptyTitle={t('Set parameters and click "Run Analysis" to view results')}
      emptyIcon={LineChart}
    >
      {results && (
        <U.Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <U.TabsList className="flex w-full justify-start overflow-x-auto">
            {TABS.map((x) => (
              <U.TabsTrigger key={x.key} value={x.key}>
                {t(x.labelKey)}
              </U.TabsTrigger>
            ))}
          </U.TabsList>
          {TABS.map((x) => (
            <U.TabsContent key={x.key} value={x.key} className="pt-4">
              <Suspense fallback={<TabFallback />}>{tabMap[x.key](results)}</Suspense>
            </U.TabsContent>
          ))}
        </U.Tabs>
      )}
    </ResultsShell>
  );
}
export default createComputeToolPage(useAnalysisPageState, {
  titleKey: 'nav.assetAnalysis',
  seoDescKey: 'analysis.seoDesc',
  hideParamsTitle: true,
  seoFeatures: [
    { titleKey: 'analysis.seoAnalyzable', descKey: 'analysis.seoDesc' },
    { titleKey: 'analysis.seoViewable', descKey: 'analysis.seoViewableDesc' },
  ],
  relatedTools: [TOOL_LINKS.backtest, TOOL_LINKS.optimizer, TOOL_LINKS.efficientF],
  params: ({ state }) => <AnalysisParamsPanel {...state} />,
  results: AnalysisResultsPanel,
});
const STATS_KEYS = [
  'cagr',
  'maxDrawdown',
  'avgDrawdown',
  'maxDrawdownDuration',
  'stdev',
  'sharpe',
  'sortino',
  'calmar',
  'ulcerIndex',
  'ulcerPerformanceIndex',
  'beta',
] as const;
const STATS_COLUMNS: StatRow[] = rowsFromMeta(STATS_KEYS);
const StatsTable = memo(function StatsTable(p: { tickers: AssetAnalysisResult['tickers'] }) {
  const { t } = useTranslation();
  const fmt = (v: number | undefined, f: StatRow['fmt'], days: string) =>
    f === 'duration' ? (v == null ? '—' : `${v} ${days}`) : f === 'pct' ? fmtPct(v) : fmtNum(v, 2);
  const rows = STATS_COLUMNS.filter((c) => p.tickers.some((x) => x.statistics[c.key] != null));
  const metricLabel = (c: StatRow) => (c.label.includes('.') ? t(c.label) : c.label);
  const cols: SimpleTableColumn<StatRow>[] = [
    { key: 'metric', label: t('Metric'), render: metricLabel },
    ...p.tickers.map((x, i) => ({
      key: x.ticker,
      label: <U.PortfolioLabel color={getPortfolioColor(i)} name={x.ticker} />,
      align: 'right' as const,
      render: (c: StatRow) => {
        const v = x.statistics[c.key] as number | undefined;
        const txt = fmt(v, c.fmt, t('days'));
        return c.colorize && v != null ? <span className={getColorClass(v)}>{txt}</span> : txt;
      },
    })),
  ];
  return <SimpleTable columns={cols} data={rows} rowKey={(c) => c.key} />;
});
