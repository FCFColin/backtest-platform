import { useEffect, lazy, Suspense, type ReactNode, type ComponentType } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Download, Loader2 } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import { Card, Button } from '@/components/ui/uiComponents';
import {
  StatisticsTable,
  ExtendedMetricsTable,
  WithdrawalRatesCard,
} from '@/components/statistics-table/StatisticsTable.js';
import { ResultsActionBar } from '@/components/results/ResultsActionBar.js';
import { SummarySidebar } from '@/components/results/SummarySidebar.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { downloadFile, dateSuffixedFilename } from '@/utils/format';
import { REBALANCE_LBL } from '@/utils/constants';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import ChartCard from '@/components/ChartCard.js';
import {
  type Portfolio,
  type PortfolioResult,
  type BacktestResult,
  type TimeSeriesPoint,
  CHART_COLORS,
  toStatsRecord,
  createEmptyStatistics,
} from '@backtest/shared';
const lazyNamed = (importer: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() =>
    importer().then((m) => ({ default: m[name] as ComponentType<Record<string, unknown>> })),
  );
const GrowthChart = lazyNamed(() => import('@/components/charts/GrowthChart'), 'GrowthChart');
const DrawdownChart = lazyNamed(
  () => import('@/components/charts/drawdownCharts'),
  'DrawdownChart',
);
const DrawdownEpisodes = lazyNamed(
  () => import('@/components/results/DrawdownEpisodes'),
  'DrawdownEpisodes',
);
const YearlyReturnsTable = lazyNamed(
  () => import('@/components/results/YearlyReturnsTable'),
  'YearlyReturnsTable',
);
const UnderwaterCurve = lazyNamed(
  () => import('@/components/charts/drawdownCharts'),
  'UnderwaterCurve',
);
const ReturnsTabDailyChart = lazy(() => import('@/components/charts/sharedChartContent'));
const TelltaleChart = lazyNamed(() => import('@/components/charts/analysis'), 'TelltaleChart');
const RiskReturnScatter = lazyNamed(
  () => import('@/components/charts/riskReturn'),
  'RiskReturnScatter',
);
const SeasonalityChart = lazyNamed(
  () => import('@/components/charts/analysis'),
  'SeasonalityChart',
);
const RegressionChart = lazy(() => import('@/components/charts/RegressionChart'));
const PortfolioAllocationChart = lazyNamed(
  () => import('@/components/charts/portfolioCharts'),
  'PortfolioAllocationChart',
);
const PortfolioPiesChart = lazyNamed(
  () => import('@/components/charts/portfolioCharts'),
  'default',
);
const RollingReturnChart = lazy(() => import('@/components/charts/rolling'));
const AnnualReturnChart = lazy(() => import('@/components/charts/AnnualReturnChart'));
const MonthlyHeatmap = lazyNamed(() => import('@/components/charts/analysis'), 'MonthlyHeatmap');
const CorrelationWithBeta = lazy(() => import('@/components/charts/CorrelationHeatmapChart'));
const CustomMetricsTable = lazy(() => import('@/components/CustomMetricsTable'));
const CashflowsLog = lazy(() => import('@/components/CashflowsLog'));
const TurnoverTaxReport = lazy(() => import('@/components/TurnoverTaxReport'));
const ALL_TABS = [
  { key: 'summary', labelKey: 'tabs.summary' },
  { key: 'metrics', labelKey: 'tabs.metrics' },
  { key: 'myMetrics', labelKey: 'tabs.myMetrics' },
  { key: 'returns', labelKey: 'tabs.returnsDist' },
  { key: 'yearlyReturns', labelKey: 'tabs.yearlyReturns' },
  { key: 'rolling', labelKey: 'tabs.rolling' },
  { key: 'seasonality', labelKey: 'tabs.seasonality' },
  { key: 'riskReturn', labelKey: 'tabs.riskReturn' },
  { key: 'drawdown', labelKey: 'tabs.drawdown' },
  { key: 'cashflows', labelKey: 'tabs.cashflows' },
  { key: 'rebalancing', labelKey: 'tabs.rebalancing' },
  { key: 'turnover', labelKey: 'tabs.turnover' },
  { key: 'allocation', labelKey: 'tabs.portfolioAllocation' },
  { key: 'pies', labelKey: 'tabs.pies' },
  { key: 'correlation', labelKey: 'tabs.correlation' },
  { key: 'telltale', labelKey: 'tabs.telltale' },
  { key: 'regression', labelKey: 'tabs.regression' },
];
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
interface RebalancingStatsProps {
  portfolios: Array<
    Pick<
      Portfolio,
      'name' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands'
    >
  >;
}
function RebalancingStats({ portfolios }: RebalancingStatsProps) {
  const { t } = useTranslation();
  const hasData =
    portfolios.length > 0 &&
    portfolios.some((p) => p.rebalanceFrequency && p.rebalanceFrequency !== 'none');
  if (!hasData)
    return (
      <ChartCard title={t('tabs.rebalancing')}>
        <div className="text-body text-fg-tertiary">{t('components.rebalancingStats.noData')}</div>
      </ChartCard>
    );
  const columns: SimpleTableColumn<(typeof portfolios)[number]>[] = [
    {
      key: 'name',
      label: t('backtest.portfolio'),
      render: (p, i) => (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-full align-middle"
            style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
          />
          {p.name}
        </span>
      ),
    },
    {
      key: 'rebalanceFrequency',
      label: t('efficientFrontier.params.rebalanceFreq'),
      render: (p) => t(REBALANCE_LBL[p.rebalanceFrequency] || p.rebalanceFrequency),
    },
    {
      key: 'rebalanceOffset',
      label: t('components.rebalancingStats.offsetDays'),
      align: 'right',
      render: (p) => String(p.rebalanceOffset ?? 0),
    },
    {
      key: 'rebalanceThreshold',
      label: t('components.rebalancingStats.deviationThreshold'),
      align: 'right',
      render: (p) => (p.rebalanceFrequency === 'threshold' ? `${p.rebalanceThreshold ?? 5}%` : '-'),
    },
    {
      key: 'rebalanceBands',
      label: t('components.rebalancingStats.rebalanceBands'),
      render: (p) =>
        p.rebalanceBands?.enabled
          ? t('components.rebalancingStats.bandsText', {
              absolute: p.rebalanceBands.absoluteBand ?? '-',
              relative: p.rebalanceBands.relativeBand ?? '-',
            })
          : t('components.rebalancingStats.bandsDisabled'),
    },
  ];
  return (
    <ChartCard title={t('tabs.rebalancing')}>
      <SimpleTable columns={columns} data={portfolios} rowKey={(p) => p.name} />
    </ChartCard>
  );
}
