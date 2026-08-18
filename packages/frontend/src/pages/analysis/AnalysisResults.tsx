/* eslint-disable react-refresh/only-export-components */
import { useState, memo, lazy, Suspense, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { LineChart } from 'lucide-react';
import { type AssetAnalysisResult } from '@backtest/shared';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { getColorClass } from '@/components/charts/chartUtils.js';
import { ResultsShell } from '@/components/resultsShell.js';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  PortfolioLabel,
  AffixInput,
  buttonVariants,
} from '@/components/ui/uiComponents';
import { Field } from '@/components/form/Field';
import { LabeledField, DollarInput, RunButton, DateField } from '@/components/form/sharedFields';
import { TickerTagInput } from '@/components/form/TickerTagInput.js';
import { AllHistoryCheckbox } from '@/components/params/toolFields.js';
import { useAnalysisData, computePairRollingCorrelation } from '../../hooks/useAnalysisData.js';
import { apiFetch } from '../../utils/apiClient.js';
import { downsample } from '../../utils/format.js';
import { createComputeToolPage, TabFallback } from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
import { useComputeTool, useSetterState } from '../../hooks/miscHooks.js';
import { fmtPct, fmtNum } from '@/utils/format';
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
function extractErrorDetail(j: Record<string, unknown>, fallback: string): string {
  const err = j.error;
  if (typeof err === 'object' && err && 'detail' in err)
    return String((err as { detail?: string }).detail);
  if (typeof err === 'string') return err;
  return fallback;
}
function throwIfError(res: Response, json: Record<string, unknown>, failedMsg: string) {
  if (!res.ok) throw new Error(extractErrorDetail(json, `HTTP ${res.status}`));
  if (json.success === false) throw new Error(extractErrorDetail(json, failedMsg));
}
function wrapFetchError(e: unknown, timeoutMsg: string, networkMsg: string): Error {
  if (e instanceof DOMException && e.name === 'AbortError') return new Error(timeoutMsg);
  if (e instanceof TypeError && e.message.includes('fetch')) return new Error(networkMsg);
  return e instanceof Error ? e : new Error(String(e));
}
async function fetchAnalysisResult(
  validTickers: string[],
  ctx: {
    startDate: string;
    endDate: string;
    startingValue: number;
    rollingWindow: number;
    correlationWindow: number;
  },
  t: (k: string) => string,
): Promise<AssetAnalysisResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await apiFetch('/api/v1/backtest/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        tickers: validTickers,
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
    let json: Record<string, unknown>;
    try {
      json = await res.json();
    } catch {
      throw new Error(
        t('Server response abnormal, please confirm backend service is running and retry'),
      );
    }
    throwIfError(res, json, t('Analysis failed'));
    const raw = (json.data ?? json) as Record<string, unknown>;
    const tickers = (raw.tickers ?? raw.assets ?? []) as AssetAnalysisResult['tickers'];
    for (const tk of tickers) {
      if (tk.growthCurve && tk.growthCurve.length > 500)
        tk.growthCurve = downsample(tk.growthCurve, 500);
      if (tk.drawdownCurve && tk.drawdownCurve.length > 500)
        tk.drawdownCurve = downsample(tk.drawdownCurve, 500);
    }
    return { tickers, correlations: (raw.correlations ?? []) as number[][] };
  } catch (e) {
    throw wrapFetchError(
      e,
      t('Connection timeout, please confirm backend service is running and retry'),
      t('Network error: unable to connect to server, please confirm backend service is running'),
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
function MonthWindowField({
  id,
  label,
  value,
  onChange,
  t,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  t: TFunction;
}) {
  return (
    <LabeledField htmlFor={id} label={label}>
      <AffixInput
        id={id}
        type="number"
        className="pr-14"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        suffix={t('months')}
      />
    </LabeledField>
  );
}
function AnalysisParamsPanel(props: {
  tickers: string[];
  setTickers: (v: string[]) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  startingValue: number;
  setStartingValue: (v: number) => void;
  rollingWindow: number;
  setRollingWindow: (v: number) => void;
  correlationWindow: number;
  setCorrelationWindow: (v: number) => void;
  isLoading: boolean;
  runAnalysis: () => void;
}) {
  const { t } = useTranslation();
  const allHistory = props.startDate === '' && props.endDate === '';
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-end">
      <Field className="sm:col-span-2 lg:col-span-3">
        <TickerTagInput
          tickers={props.tickers.filter(Boolean)}
          onChange={props.setTickers}
          minCount={1}
          placeholder={t('Enter symbol, e.g. SPY')}
        />
      </Field>
      <AllHistoryCheckbox
        startDate={props.startDate}
        endDate={props.endDate}
        onStartDateChange={props.setStartDate}
        onEndDateChange={props.setEndDate}
        label={t('All History')}
      />
      <DateField
        id="analysis-start-date"
        label={t('Start Date')}
        value={props.startDate}
        fallback={DEFAULT_BACKTEST_START_DATE}
        onChange={props.setStartDate}
        disabled={allHistory}
      />
      <DateField
        id="analysis-end-date"
        label={t('End Date')}
        value={props.endDate}
        fallback={DEFAULT_END_DATE}
        onChange={props.setEndDate}
        disabled={allHistory}
      />
      <LabeledField htmlFor="analysis-starting-value" label={t('Starting Value')}>
        <DollarInput
          id="analysis-starting-value"
          type="number"
          value={props.startingValue}
          onChange={(e) => props.setStartingValue(Number(e.target.value))}
        />
      </LabeledField>
      <MonthWindowField
        id="analysis-rolling-window"
        label={t('Rolling Window')}
        value={props.rollingWindow}
        onChange={props.setRollingWindow}
        t={t}
      />
      <MonthWindowField
        id="analysis-correlation-window"
        label={t('Correlation Window')}
        value={props.correlationWindow}
        onChange={props.setCorrelationWindow}
        t={t}
      />
      <div className="flex justify-end sm:col-span-1 lg:col-span-2">
        <RunButton
          isLoading={props.isLoading}
          onClick={props.runAnalysis}
          label={t('Run Analysis')}
          loadingLabel={t('Analyzing...')}
          className={cn(buttonVariants({ variant: 'primary', size: 'default' }), 'w-auto')}
        />
      </div>
    </div>
  );
}
function useAnalysisPageState() {
  const { t } = useTranslation();
  const [tickers, setTickers] = useState(['SPY', 'TLT', 'GLD']);
  const s = useSetterState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    startingValue: 10000,
    rollingWindow: 12,
    correlationWindow: 12,
    activeTab: 'summary',
  });
  const {
    isLoading,
    error,
    results,
    setResults,
    runCompute: runAnalysis,
  } = useComputeTool<AssetAnalysisResult>(
    async () =>
      fetchAnalysisResult(
        tickers.filter(Boolean).map(normalizeTicker),
        {
          startDate: s.startDate,
          endDate: s.endDate,
          startingValue: s.startingValue,
          rollingWindow: s.rollingWindow,
          correlationWindow: s.correlationWindow,
        },
        t,
      ),
    () => (tickers.filter(Boolean).length > 0 ? null : t('Please enter at least one ticker')),
  );
  return { tickers, ...s, isLoading, error, results, setTickers, setResults, runAnalysis };
}
const OverviewCharts = lazyNamed(
  () => import('../../components/charts/analysis.js'),
  'OverviewCharts',
);
const TelltaleChart = lazyNamed(
  () => import('../../components/charts/analysis.js'),
  'TelltaleChart',
);
const MonthlyHeatmap = lazyNamed(
  () => import('../../components/charts/analysis.js'),
  'MonthlyHeatmap',
);
const CorrelationMatrixTable = lazyNamed(
  () => import('../../components/charts/tables.js'),
  'CorrelationMatrixTable',
);
const BetaMatrixTable = lazyNamed(
  () => import('../../components/charts/tables.js'),
  'BetaMatrixTable',
);
const RollingCorrelationChart = lazyNamed(
  () => import('../../components/charts/rolling.js'),
  'RollingCorrelationChart',
);
const RollingMetricsChart = lazyNamed(
  () => import('../../components/charts/rolling.js'),
  'RollingMetricsChart',
);
const RiskReturnChart = lazyNamed(
  () => import('../../components/charts/riskReturn.js'),
  'RiskReturnChart',
);
const AnnualReturnChart = lazy(() => import('../../components/charts/AnnualReturnChart.js'));
function CorrelationsBetaTab({
  results,
  correlationWindow,
}: {
  results: AssetAnalysisResult;
  correlationWindow: number;
}) {
  const [rollingPair, setRollingPair] = useState<[number, number]>([
    0,
    Math.min(1, results.tickers.length - 1),
  ]);
  const tickers = results.tickers.map((tk) => tk.ticker);
  const { betaMatrix } = useAnalysisData(results);
  const rollingCorrData = useMemo(
    () => computePairRollingCorrelation(results.tickers, rollingPair, correlationWindow),
    [results, rollingPair, correlationWindow],
  );
  return (
    <div className="space-y-6">
      <CorrelationMatrixTable tickers={results.tickers} correlations={results.correlations} />
      <BetaMatrixTable tickers={tickers} betaMatrix={betaMatrix} />
      {results.tickers.length >= 2 && (
        <RollingCorrelationChart
          tickers={tickers}
          rollingPair={rollingPair}
          setRollingPair={setRollingPair}
          rollingCorrData={rollingCorrData}
        />
      )}
    </div>
  );
}
const AnalysisResultsPanel = memo(function AnalysisResultsPanel({
  state: s,
}: {
  state: AnalysisPageState;
}) {
  const { error, results, activeTab, setActiveTab, isLoading, correlationWindow, rollingWindow } =
    s;
  const { t } = useTranslation();
  const renderTab: Record<(typeof TABS)[number]['key'], (r: AssetAnalysisResult) => ReactNode> = {
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex w-full justify-start overflow-x-auto">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((tab) => (
            <TabsContent key={tab.key} value={tab.key} className="pt-4">
              <Suspense fallback={<TabFallback />}>{renderTab[tab.key](results)}</Suspense>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </ResultsShell>
  );
});
type AnalysisPageState = ReturnType<typeof useAnalysisPageState>;
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
export const StatsTable = memo(function StatsTable({
  tickers,
}: {
  tickers: AssetAnalysisResult['tickers'];
}) {
  const { t } = useTranslation();
  const fmt = (v: number | undefined, f: StatRow['fmt']) =>
    f === 'duration'
      ? v == null
        ? '—'
        : `${v} ${t('days')}`
      : f === 'pct'
        ? fmtPct(v)
        : fmtNum(v, 2);
  const rows = STATS_COLUMNS.filter((c) => tickers.some((tk) => tk.statistics[c.key] != null));
  const columns: SimpleTableColumn<StatRow>[] = [
    {
      key: 'metric',
      label: t('Metric'),
      render: (c) => (c.label.includes('.') ? t(c.label) : c.label),
    },
    ...tickers.map((tk, idx) => ({
      key: tk.ticker,
      label: <PortfolioLabel color={getPortfolioColor(idx)} name={tk.ticker} />,
      align: 'right' as const,
      render: (c: StatRow) => {
        const v = tk.statistics[c.key] as number | undefined;
        const text = fmt(v, c.fmt);
        return c.colorize && v != null ? <span className={getColorClass(v)}>{text}</span> : text;
      },
    })),
  ];
  return <SimpleTable columns={columns} data={rows} rowKey={(c) => c.key} />;
});
