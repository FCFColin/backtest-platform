import { useState, memo, lazy, Suspense, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
} from '@/components/ui/uiComponents';
import { useAnalysisData, computePairRollingCorrelation } from '../../hooks/useAnalysisData.js';
import { TABS, fetchAnalysisResult } from './analysisUtils.js';
import { AnalysisParamsPanel } from './AnalysisParams.js';
import {
  ComputeToolShell,
  TabFallback,
  type ComputeToolConfig,
} from '../../components/shells/index.js';
import { TOOL_LINKS } from '../../components/shells/constants.js';
import { useComputeTool, useSetterState } from '../../hooks/miscHooks.js';
import { fmtPct, fmtNum } from '@/utils/format';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import { rowsFromMeta } from '../../components/statistics-table/columns.js';
import type { StatRow } from '../../components/statistics-table/types.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { normalizeTicker } from '@/utils/ticker';
import { lazyNamed } from '@/utils/lazyImport';
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
const config: ComputeToolConfig<AnalysisPageState> = {
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
};
export default function AnalysisPage() {
  const s = useAnalysisPageState();
  return <ComputeToolShell config={config} state={s} />;
}
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
