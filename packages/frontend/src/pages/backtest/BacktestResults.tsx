import { useEffect, lazy, Suspense, type ReactNode } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import { Card } from '@/components/ui/uiComponents';
import { Button } from '@/components/ui/uiComponents';
import { StatisticsTable } from '@/components/statistics-table/StatisticsTable.js';
import { ExtendedMetricsTable } from '@/components/statistics-table/ExtendedMetricsTable.js';
import { WithdrawalRatesCard } from '@/components/statistics-table/WithdrawalRatesCard.js';
import { ResultsActionBar } from '@/components/results/ResultsActionBar.js';
import { SummarySidebar } from '@/components/results/SummarySidebar.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { downloadFile, dateSuffixedFilename } from '@/utils/format';
import {
  type Portfolio,
  type PortfolioResult,
  type BacktestResult,
  type TimeSeriesPoint,
  toStatsRecord,
  createEmptyStatistics,
} from '@backtest/shared';
const GrowthChart = lazy(() =>
  import('@/components/charts/analysis').then((m) => ({ default: m.GrowthChart })),
);
const DrawdownChart = lazy(() =>
  import('@/components/charts/DrawdownChart').then((m) => ({ default: m.DrawdownChart })),
);
const DrawdownEpisodes = lazy(() =>
  import('@/components/results/DrawdownEpisodes').then((m) => ({ default: m.DrawdownEpisodes })),
);
const YearlyReturnsTable = lazy(() =>
  import('@/components/results/YearlyReturnsTable').then((m) => ({
    default: m.YearlyReturnsTable,
  })),
);
const UnderwaterCurve = lazy(() =>
  import('@/components/charts/UnderwaterCurve').then((m) => ({ default: m.UnderwaterCurve })),
);
const ReturnsTabDailyChart = lazy(() => import('@/components/charts/sharedChartContent'));
const TelltaleChart = lazy(() =>
  import('@/components/charts/analysis').then((m) => ({ default: m.TelltaleChart })),
);
const RiskReturnScatter = lazy(() =>
  import('@/components/charts/riskReturn').then((m) => ({ default: m.RiskReturnScatter })),
);
const SeasonalityChart = lazy(() =>
  import('@/components/charts/analysis').then((m) => ({ default: m.SeasonalityChart })),
);
const RegressionChart = lazy(() => import('@/components/charts/RegressionChart'));
const PortfolioAllocationChart = lazy(() =>
  import('@/components/charts/portfolioCharts').then((m) => ({
    default: m.PortfolioAllocationChart,
  })),
);
const PortfolioPiesChart = lazy(() =>
  import('@/components/charts/portfolioCharts').then((m) => ({ default: m.default })),
);
const RollingReturnChart = lazy(() => import('@/components/charts/rolling'));
const AnnualReturnChart = lazy(() => import('@/components/charts/AnnualReturnChart'));
const MonthlyHeatmap = lazy(() =>
  import('@/components/charts/analysis').then((m) => ({ default: m.MonthlyHeatmap })),
);
const CorrelationWithBeta = lazy(() => import('@/components/charts/CorrelationHeatmapChart'));
const CustomMetricsTable = lazy(() => import('@/components/CustomMetricsTable'));
const RebalancingStats = lazy(() => import('@/components/RebalancingStats'));
const CashflowsLog = lazy(() => import('@/components/CashflowsLog'));
const TurnoverTaxReport = lazy(() => import('@/components/TurnoverTaxReport'));
const TAB_GROUPS = [
  { groupKey: 'tabs.summary', tabs: [{ key: 'summary', labelKey: 'tabs.summary' }] },
  {
    groupKey: 'tabs.returns',
    tabs: [
      { key: 'metrics', labelKey: 'tabs.metrics' },
      { key: 'myMetrics', labelKey: 'tabs.myMetrics' },
      { key: 'returns', labelKey: 'tabs.returnsDist' },
      { key: 'yearlyReturns', labelKey: 'tabs.yearlyReturns' },
      { key: 'rolling', labelKey: 'tabs.rolling' },
      { key: 'seasonality', labelKey: 'tabs.seasonality' },
      { key: 'riskReturn', labelKey: 'tabs.riskReturn' },
      { key: 'drawdown', labelKey: 'tabs.drawdown' },
    ],
  },
  {
    groupKey: 'tabs.events',
    tabs: [
      { key: 'cashflows', labelKey: 'tabs.cashflows' },
      { key: 'rebalancing', labelKey: 'tabs.rebalancing' },
      { key: 'turnover', labelKey: 'tabs.turnover' },
    ],
  },
  {
    groupKey: 'tabs.allocation',
    tabs: [
      { key: 'allocation', labelKey: 'tabs.portfolioAllocation' },
      { key: 'pies', labelKey: 'tabs.pies' },
      { key: 'correlation', labelKey: 'tabs.correlation' },
    ],
  },
  {
    groupKey: 'tabs.signalsStatus',
    tabs: [
      { key: 'telltale', labelKey: 'tabs.telltale' },
      { key: 'regression', labelKey: 'tabs.regression' },
    ],
  },
];
const ALL_TABS = TAB_GROUPS.flatMap((g) => g.tabs);
const COMMON_STATS_PROPS = (pf: PortfolioResult[]) => ({
  portfolios: pf.map((p) => ({ id: p.name, name: p.name, stats: toStatsRecord(p.statistics) })),
  colors: pf.map((_, i) => getPortfolioColor(i)),
});
const mapDrawdown = (pf: PortfolioResult[]) =>
  pf.map((p) => ({
    id: p.name,
    name: p.name,
    drawdownCurve: (p.drawdownCurve ?? []).map((pt) => ({ date: pt.date, drawdown: pt.drawdown })),
  }));
function TabBar() {
  const { t } = useTranslation();
  const activeTab = useBacktestStore((s) => s.activeTab);
  const setActiveTab = useBacktestStore((s) => s.setActiveTab);
  const handleExport = () => {
    const results = useBacktestStore.getState().results;
    if (results?.portfolios?.length) exportResultsCSV(results);
  };
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2 mb-3">
      <div className="flex flex-wrap items-center gap-1">
        {ALL_TABS.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab(tab.key)}
          >
            {t(tab.labelKey)}
          </Button>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={handleExport}>
        <Download />
        Export CSV
      </Button>
    </div>
  );
}
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-10 text-fg-tertiary">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
type TabCtx = {
  pf: PortfolioResult[];
  pfs: Portfolio[];
  r: {
    assetTickers?: string[];
    assetCorrelations?: number[][];
    correlations?: number[][];
    portfolios?: PortfolioResult[];
    benchmarkGrowth?: TimeSeriesPoint[];
  };
};
const TAB_RENDERERS: Record<string, (c: TabCtx) => ReactNode> = {
  summary: ({ pf }) => {
    const firstPf = pf[0];
    const annualReturns = firstPf?.annualReturns ?? [];
    const positiveYears = annualReturns.filter((r) => r.return > 0).length;
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
        <SummarySidebar
          stats={firstPf?.statistics ?? createEmptyStatistics()}
          totalYears={annualReturns.length}
          positiveYears={positiveYears}
        />
        <div className="space-y-4 min-w-0">
          <GrowthChart
            portfolios={pf.map((p) => ({
              id: p.name,
              name: p.name,
              growthCurve: p.growthCurve ?? [],
            }))}
          />
          <DrawdownChart portfolios={mapDrawdown(pf)} />
          <StatisticsTable
            {...COMMON_STATS_PROPS(pf)}
            extendedTable={<ExtendedMetricsTable {...COMMON_STATS_PROPS(pf)} />}
          />
          <WithdrawalRatesCard portfolios={pf} />
          <DrawdownEpisodes episodes={firstPf?.drawdownEpisodes ?? []} />
        </div>
      </div>
    );
  },
  metrics: ({ pf }) => (
    <StatisticsTable
      {...COMMON_STATS_PROPS(pf)}
      extendedTable={<ExtendedMetricsTable {...COMMON_STATS_PROPS(pf)} />}
    />
  ),
  myMetrics: ({ pf }) => <CustomMetricsTable portfolios={pf} />,
  returns: ({ pf }) => (
    <>
      <AnnualReturnChart portfolios={pf} />
      {pf.map((x) => (
        <MonthlyHeatmap key={x.name} portfolio={x} />
      ))}
      <ReturnsTabDailyChart portfolios={pf} bins={[]} />
    </>
  ),
  yearlyReturns: ({ pf, r }) => (
    <YearlyReturnsTable portfolios={pf} benchmarkGrowth={r?.benchmarkGrowth} />
  ),
  drawdown: ({ pf }) => <UnderwaterCurve portfolios={mapDrawdown(pf)} />,
  rolling: ({ pf }) => <RollingReturnChart portfolios={pf} />,
  seasonality: ({ pf }) => <SeasonalityChart portfolios={pf} />,
  riskReturn: ({ pf }) => <RiskReturnScatter portfolios={pf} />,
  cashflows: () => <CashflowsLog parameters={useBacktestStore.getState().parameters} />,
  rebalancing: ({ pfs }) => <RebalancingStats portfolios={pfs} />,
  turnover: ({ pf }) => <TurnoverTaxReport portfolios={pf} />,
  allocation: ({ pf, pfs }) => (
    <PortfolioAllocationChart
      portfolios={(pf ?? []).map(
        (rp, idx) =>
          ({
            name: rp.name,
            assets: pfs[idx]?.assets ?? [],
            growthCurve: rp.growthCurve,
            allocationHistory: rp.allocationHistory,
          }) as never,
      )}
    />
  ),
  pies: ({ pfs }) => <PortfolioPiesChart portfolios={pfs} />,
  correlation: ({ pf, r }) => (
    <CorrelationWithBeta
      portfolios={pf}
      assetTickers={r?.assetTickers}
      assetCorrelations={r?.assetCorrelations}
      portfolioCorrelations={r?.correlations}
    />
  ),
  telltale: ({ pf }) => <TelltaleChart portfolios={pf} />,
  regression: ({ pf }) => <RegressionChart portfolios={pf} />,
};
function exportResultsCSV(results: BacktestResult) {
  if (!results?.portfolios?.length) return;
  const pf = results.portfolios[0];
  if (!pf?.growthCurve?.length) return;
  const headers = ['date', ...results.portfolios.map((p) => p.name)];
  const dates = pf.growthCurve.map((pt) => new Date(pt.date).toISOString().split('T')[0]);
  const rows = dates.map((date, i) => [
    date,
    ...results.portfolios.map((p) => p.growthCurve[i]?.value?.toFixed(4) ?? ''),
  ]);
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csv, dateSuffixedFilename('backtest-results', 'csv'), 'text/csv;charset=utf-8;');
}
function computeTimeRange(results: BacktestResult) {
  const pf = results.portfolios[0];
  const first = pf?.growthCurve?.[0]?.date;
  const last = pf?.growthCurve?.[pf.growthCurve.length - 1]?.date;
  const years =
    first && last
      ? (new Date(last).getTime() - new Date(first).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      : 0;
  return { start: first ?? '—', end: last ?? '—', years };
}
export function ResultsContent() {
  const { t } = useTranslation();
  const results = useBacktestStore((s) => s.results);
  const isLoading = useBacktestStore((s) => s.isLoading);
  const activeTab = useBacktestStore((s) => s.activeTab);
  const portfolios = useBacktestStore((s) => s.portfolios);
  const enrichSeries = useBacktestStore((s) => s.enrichSeries);
  useEffect(() => {
    if (!results) return;
    if (activeTab === 'rolling') void enrichSeries(['rollingReturns']);
    else if (activeTab === 'turnover' || activeTab === 'allocation')
      void enrichSeries(['allocationHistory']);
    else if (activeTab === 'summary') void enrichSeries(['drawdownEpisodes']);
  }, [activeTab, results, enrichSeries]);
  if (isLoading && !results)
    return (
      <Card className="flex items-center justify-center p-10">
        <Loader2 className="size-6 animate-spin text-fg-tertiary" />
      </Card>
    );
  if (!results || results.portfolios.length === 0)
    return (
      <Card className="flex items-center justify-center p-12">
        <span className="text-body text-fg-tertiary">{t('backtest.noResultsHint')}</span>
      </Card>
    );
  const renderer = TAB_RENDERERS[activeTab];
  return (
    <div className="space-y-4">
      <ResultsActionBar
        timeRange={computeTimeRange(results)}
        onExport={() => exportResultsCSV(results)}
      />
      <Card className="p-5">
        <TabBar />
        <Suspense fallback={<LoadingFallback />}>
          {renderer && (
            <>{renderer({ pf: results.portfolios, pfs: portfolios, r: results as TabCtx['r'] })}</>
          )}
        </Suspense>
      </Card>
      <p className="text-xs text-fg-tertiary">
        <Trans i18nKey="stats.survivorshipBiasWarning" components={{ link: <Link to="/help" /> }} />
      </p>
    </div>
  );
}
