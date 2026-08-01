import { useState, memo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart } from 'lucide-react';
import type { AssetAnalysisResult, Statistics } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { AnalysisErrorAlert } from '@/components/resultsShell.js';
import { EmptyState } from '@/components/stateDisplay';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/uiComponents';
import { useAnalysisData } from '../../hooks/useAnalysisData.js';
import { TABS, fetchAnalysisResult } from './analysisUtils.js';
import { AnalysisParamsPanel } from './AnalysisParams.js';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { useComputeTool, useListState } from '../../hooks/miscHooks.js';
import { fmtPct } from '@/utils/format';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { Loader2 } from '@/icons/icons.js';
function useAnalysisPageState() {
  const { t } = useTranslation();
  const {
    items: tickers,
    setItems: setTickers,
    addItem: addTicker,
    removeItem: removeTicker,
    updateItem,
  } = useListState<string>(['SPY', 'TLT', 'GLD'], () => '', 1);
  const updateTicker = (idx: number, val: string) => updateItem(idx, () => val);
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [startingValue, setStartingValue] = useState(10000);
  const [rollingWindow, setRollingWindow] = useState(12);
  const [correlationWindow, setCorrelationWindow] = useState(12);
  const [adjustForInflation, setAdjustForInflation] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const {
    isLoading,
    error,
    results,
    setResults,
    runCompute: runAnalysis,
  } = useComputeTool<AssetAnalysisResult>(
    async () => {
      const validTickers = tickers.filter(Boolean).map((tk) => tk.toUpperCase());
      return fetchAnalysisResult(
        validTickers,
        {
          startDate,
          endDate,
          startingValue,
          adjustForInflation,
          rollingWindow,
          correlationWindow,
        },
        t,
      );
    },
    () => (tickers.filter(Boolean).length > 0 ? null : t('analysis.errorMinOneTicker')),
  );
  return {
    tickers,
    startDate,
    endDate,
    startingValue,
    rollingWindow,
    correlationWindow,
    adjustForInflation,
    activeTab,
    isLoading,
    error,
    results,
    setTickers,
    setStartDate,
    setEndDate,
    setStartingValue,
    setRollingWindow,
    setCorrelationWindow,
    setAdjustForInflation,
    setActiveTab,
    setResults,
    addTicker,
    removeTicker,
    updateTicker,
    runAnalysis,
  };
}
const OverviewCharts = lazy(() =>
  import('../../components/charts/analysis.js').then((m) => ({ default: m.OverviewCharts })),
);
const TelltaleChart = lazy(() =>
  import('../../components/charts/analysis.js').then((m) => ({ default: m.TelltaleChart })),
);
const CorrelationMatrixTable = lazy(() =>
  import('../../components/charts/tables.js').then((m) => ({ default: m.CorrelationMatrixTable })),
);
const BetaMatrixTable = lazy(() =>
  import('../../components/charts/tables.js').then((m) => ({ default: m.BetaMatrixTable })),
);
const RollingCorrelationChart = lazy(() =>
  import('../../components/charts/rolling.js').then((m) => ({
    default: m.RollingCorrelationChart,
  })),
);
const RollingMetricsChart = lazy(() =>
  import('../../components/charts/rolling.js').then((m) => ({ default: m.RollingMetricsChart })),
);
const RiskReturnChart = lazy(() =>
  import('../../components/charts/riskReturn.js').then((m) => ({ default: m.RiskReturnChart })),
);
const AnnualReturnChart = lazy(() => import('../../components/charts/AnnualReturnChart.js'));
const MonthlyHeatmap = lazy(() =>
  import('../../components/charts/analysis.js').then((m) => ({ default: m.MonthlyHeatmap })),
);
function TabFallback() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
    </div>
  );
}
const SummaryTab = memo(function SummaryTab({ results }: { results: AssetAnalysisResult }) {
  return (
    <Suspense fallback={<TabFallback />}>
      <OverviewCharts results={results} StatsTable={StatsTable} />
    </Suspense>
  );
});
const TelltaleTab = memo(function TelltaleTab({ results }: { results: AssetAnalysisResult }) {
  return (
    <Suspense fallback={<TabFallback />}>
      <TelltaleChart results={results} />
    </Suspense>
  );
});
const CorrelationsBetaTab = memo(function CorrelationsBetaTab({
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
  const { betaMatrix, rollingCorrData } = useAnalysisData(results, correlationWindow, 12);
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
});
const RollingMetricsTab = memo(function RollingMetricsTab({
  results,
  rollingWindow,
}: {
  results: AssetAnalysisResult;
  rollingWindow: number;
}) {
  return <RollingMetricsChart results={results} rollingWindow={rollingWindow} />;
});
const RiskReturnTab = memo(function RiskReturnTab({ results }: { results: AssetAnalysisResult }) {
  return <RiskReturnChart results={results} />;
});
const ReturnsTab = memo(function ReturnsTab({ results }: { results: AssetAnalysisResult }) {
  return (
    <div className="space-y-6">
      <AnnualReturnChart results={results} />
      <MonthlyHeatmap results={results} />
    </div>
  );
});
export const AnalysisResultsPanel = memo(function AnalysisResultsPanel({
  error,
  results,
  activeTab,
  setActiveTab,
  isLoading,
  correlationWindow,
  rollingWindow,
}: {
  error: string | null;
  results: AssetAnalysisResult | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isLoading: boolean;
  correlationWindow: number;
  rollingWindow: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <AnalysisErrorAlert error={error} prefix={`${t('analysis.analysisFailed')}：`} />
      {results && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex w-full justify-start overflow-x-auto">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="summary" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <SummaryTab results={results} />
            </Suspense>
          </TabsContent>
          <TabsContent value="telltale" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <TelltaleTab results={results} />
            </Suspense>
          </TabsContent>
          <TabsContent value="correlations" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <CorrelationsBetaTab results={results} correlationWindow={correlationWindow} />
            </Suspense>
          </TabsContent>
          <TabsContent value="rolling" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <RollingMetricsTab results={results} rollingWindow={rollingWindow} />
            </Suspense>
          </TabsContent>
          <TabsContent value="risk-return" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <RiskReturnTab results={results} />
            </Suspense>
          </TabsContent>
          <TabsContent value="returns" className="pt-4">
            <Suspense fallback={<TabFallback />}>
              <ReturnsTab results={results} />
            </Suspense>
          </TabsContent>
        </Tabs>
      )}
      {!results && !error && !isLoading && (
        <EmptyState icon={LineChart} title={t('analysis.noResultsHint')} />
      )}
    </div>
  );
});
type AnalysisPageState = ReturnType<typeof useAnalysisPageState>;
function AnalysisParamsWrapper({ state }: { state: AnalysisPageState }) {
  return (
    <AnalysisParamsPanel
      tickers={state.tickers}
      setTickers={state.setTickers}
      startDate={state.startDate}
      setStartDate={state.setStartDate}
      endDate={state.endDate}
      setEndDate={state.setEndDate}
      startingValue={state.startingValue}
      setStartingValue={state.setStartingValue}
      rollingWindow={state.rollingWindow}
      setRollingWindow={state.setRollingWindow}
      correlationWindow={state.correlationWindow}
      setCorrelationWindow={state.setCorrelationWindow}
      adjustForInflation={state.adjustForInflation}
      setAdjustForInflation={state.setAdjustForInflation}
      isLoading={state.isLoading}
      runAnalysis={state.runAnalysis}
    />
  );
}
function AnalysisResultsWrapper({ state }: { state: AnalysisPageState }) {
  return (
    <AnalysisResultsPanel
      error={state.error}
      results={state.results}
      activeTab={state.activeTab}
      setActiveTab={state.setActiveTab}
      isLoading={state.isLoading}
      correlationWindow={state.correlationWindow}
      rollingWindow={state.rollingWindow}
    />
  );
}
const config: ComputeToolConfig<AnalysisPageState> = {
  titleKey: 'analysis.title',
  seoDescKey: 'analysis.seoDesc',
  hideParamsTitle: true,
  seoFeatures: [
    { titleKey: 'analysis.seoAnalyzable', descKey: 'analysis.seoAnalyzableDesc' },
    { titleKey: 'analysis.seoViewable', descKey: 'analysis.seoViewableDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'optimizer.title', href: '/optimizer' },
    { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' },
  ],
  params: AnalysisParamsWrapper,
  results: AnalysisResultsWrapper,
};
export default function AnalysisPage() {
  const s = useAnalysisPageState();
  return <ComputeToolShell config={config} state={s} />;
}
const STATS_COLUMNS: {
  key: keyof Statistics;
  labelKey: string;
  fmt: 'pct' | 'ratio' | 'duration';
}[] = [
  { key: 'cagr', labelKey: 'CAGR', fmt: 'pct' },
  { key: 'maxDrawdown', labelKey: 'backtest.maxDrawdown', fmt: 'pct' },
  { key: 'avgDrawdown', labelKey: 'analysis.avgDrawdown', fmt: 'pct' },
  { key: 'maxDrawdownDuration', labelKey: 'analysis.maxDrawdownDuration', fmt: 'duration' },
  { key: 'stdev', labelKey: 'backtest.stdev', fmt: 'pct' },
  { key: 'sharpe', labelKey: 'backtest.sharpeRatio', fmt: 'ratio' },
  { key: 'sortino', labelKey: 'Sortino', fmt: 'ratio' },
  { key: 'calmar', labelKey: 'Calmar', fmt: 'ratio' },
  { key: 'ulcerIndex', labelKey: 'analysis.ulcerIndex', fmt: 'ratio' },
  { key: 'ulcerPerformanceIndex', labelKey: 'UPI', fmt: 'ratio' },
  { key: 'beta', labelKey: 'Beta', fmt: 'ratio' },
];
function StatsTableHeader({
  tickers,
  metricLabel,
}: {
  tickers: AssetAnalysisResult['tickers'];
  metricLabel: string;
}) {
  return (
    <thead>
      <tr className="bg-elevated">
        <th className="py-2 px-3 text-left text-caption font-semibold uppercase tracking-wide text-fg-tertiary border-b border-border-subtle">
          {metricLabel}
        </th>
        {tickers.map((tk, idx) => (
          <th
            key={tk.ticker}
            className="py-2 px-3 text-right text-caption font-semibold uppercase tracking-wide text-fg-tertiary border-b border-border-subtle whitespace-nowrap"
          >
            <span
              className="mr-1.5 inline-block size-2.5 rounded-full align-middle"
              style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
            />
            {tk.ticker}
          </th>
        ))}
      </tr>
    </thead>
  );
}
export const StatsTable = memo(function StatsTable({
  tickers,
}: {
  tickers: AssetAnalysisResult['tickers'];
}) {
  const { t } = useTranslation();
  const cols = STATS_COLUMNS.map((c) => ({
    ...c,
    label: c.labelKey.includes('.') ? t(c.labelKey) : c.labelKey,
  }));
  const fmt = (v: number | undefined, f: 'pct' | 'ratio' | 'duration') => {
    if (v === undefined || v === null) return '-';
    if (f === 'pct') return fmtPct(v);
    if (f === 'ratio') return v.toFixed(2);
    return `${v} ${t('common.days')}`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-body">
        <StatsTableHeader tickers={tickers} metricLabel={t('common.metric')} />
        <tbody>
          {cols.map((col, ri) => {
            if (!tickers.some((tk) => tk.statistics[col.key] != null)) return null;
            return (
              <tr key={col.key} className={ri % 2 === 1 ? 'bg-elevated' : 'bg-transparent'}>
                <td className="py-2 px-3 text-fg-secondary border-b border-border-subtle">
                  {col.label}
                </td>
                {tickers.map((tk) => (
                  <td
                    key={tk.ticker}
                    className="py-2 px-3 text-right font-mono tabular-nums font-medium text-fg border-b border-border-subtle whitespace-nowrap"
                  >
                    {fmt(tk.statistics[col.key] as number | undefined, col.fmt)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
