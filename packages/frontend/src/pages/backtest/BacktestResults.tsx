import { useEffect, useRef, Suspense, type ReactNode } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { MoreHorizontal } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import {
  Card,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  PortfolioLabel,
} from '@/components/ui/uiComponents';
import {
  StatisticsTable,
  ExtendedMetricsTable,
  WithdrawalRatesCard,
} from '@/components/statistics-table/StatisticsTable.js';
import { ResultsActionBar } from '@/components/results/ResultsActionBar.js';
import { SummarySidebar } from '@/components/results/SummarySidebar.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { downloadJSON, dateSuffixedFilename, downloadCSV } from '@/utils/format';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import { TabFallback } from '@/components/shells';
import ChartCard from '@/components/ChartCard.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { ChartEmptyState, ErrorBanner } from '@/components/stateDisplay.js';
import { lazyNamed } from '@/utils/lazyImport';
import {
  type Portfolio,
  type PortfolioResult,
  type BacktestResult,
  type TimeSeriesPoint,
  REBALANCE_LABELS,
  toStatsRecord,
  createEmptyStatistics,
} from '@backtest/shared';
const L = {
  GrowthChart: lazyNamed(() => import('@/components/charts/GrowthChart'), 'GrowthChart'),
  DrawdownChart: lazyNamed(() => import('@/components/charts/drawdownCharts'), 'DrawdownChart'),
  DrawdownEpisodes: lazyNamed(
    () => import('@/components/results/DrawdownEpisodes'),
    'DrawdownEpisodes',
  ),
  YearlyReturnsTable: lazyNamed(
    () => import('@/components/results/YearlyReturnsTable'),
    'YearlyReturnsTable',
  ),
  UnderwaterCurve: lazyNamed(() => import('@/components/charts/drawdownCharts'), 'UnderwaterCurve'),
  TelltaleChart: lazyNamed(() => import('@/components/charts/analysis'), 'TelltaleChart'),
  RiskReturnScatter: lazyNamed(() => import('@/components/charts/riskReturn'), 'RiskReturnScatter'),
  SeasonalityChart: lazyNamed(() => import('@/components/charts/analysis'), 'SeasonalityChart'),
  RegressionChart: lazyNamed(
    () => import('@/components/charts/RegressionChart'),
    'RegressionChart',
  ),
  PortfolioAllocationChart: lazyNamed(
    () => import('@/components/charts/portfolioCharts'),
    'PortfolioAllocationChart',
  ),
  PortfolioPiesChart: lazyNamed(() => import('@/components/charts/portfolioCharts'), 'default'),
  RollingReturnChart: lazyNamed(() => import('@/components/charts/rolling'), 'RollingReturnChart'),
  AnnualReturnChart: lazyNamed(
    () => import('@/components/charts/AnnualReturnChart'),
    'AnnualReturnChart',
  ),
  MonthlyHeatmap: lazyNamed(() => import('@/components/charts/analysis'), 'MonthlyHeatmap'),
  CorrelationWithBeta: lazyNamed(
    () => import('@/components/charts/CorrelationHeatmapChart'),
    'CorrelationWithBeta',
  ),
  CustomMetricsTable: lazyNamed(
    () => import('@/components/CustomMetricsTable'),
    'CustomMetricsTable',
  ),
  CashflowsLog: lazyNamed(() => import('@/components/CashflowsLog'), 'CashflowsLog'),
  TurnoverTaxReport: lazyNamed(() => import('@/components/TurnoverTaxReport'), 'TurnoverTaxReport'),
};
const ALL_TABS = [
  { key: 'summary', labelKey: 'tabs.summary' },
  { key: 'myMetrics', labelKey: 'My Metrics' },
  { key: 'returns', labelKey: 'tabs.returnsDist' },
  { key: 'yearlyReturns', labelKey: 'Annual Returns' },
  { key: 'rolling', labelKey: 'tabs.rolling' },
  { key: 'seasonality', labelKey: 'Seasonality' },
  { key: 'riskReturn', labelKey: 'tabs.riskReturn' },
  { key: 'drawdown', labelKey: 'tabs.drawdown' },
  { key: 'cashflows', labelKey: 'tabs.cashflows' },
  { key: 'rebalancing', labelKey: 'tabs.rebalancing' },
  { key: 'turnover', labelKey: 'tabs.turnover' },
  { key: 'allocation', labelKey: 'Asset Allocation' },
  { key: 'pies', labelKey: 'Allocation Pies' },
  { key: 'correlation', labelKey: 'Correlation' },
  { key: 'telltale', labelKey: 'tabs.telltale' },
  { key: 'regression', labelKey: 'tabs.regression' },
];
const PRIMARY_TABS = new Set(['summary', 'returns', 'yearlyReturns', 'rolling', 'drawdown']);
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
const TabBtn = ({
  tab,
  active,
  onClick,
}: {
  tab: { key: string; labelKey: string };
  active: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <Button
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      className={active ? 'shrink-0 text-brand border-b-2 border-brand rounded-b-none' : 'shrink-0'}
      aria-pressed={active}
      onClick={onClick}
    >
      {t(tab.labelKey)}
    </Button>
  );
};
function TabBar() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const activeTab = useBacktestStore((s) => s.activeTab);
  const setActiveTab = useBacktestStore((s) => s.setActiveTab);
  useEffect(() => {
    if (urlTab && urlTab !== activeTab) setActiveTab(urlTab);
  }, [urlTab, activeTab, setActiveTab]);
  const selectTab = (tab: string) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next);
  };
  const moreTabs = ALL_TABS.filter((tab) => !PRIMARY_TABS.has(tab.key));
  const activeMore = moreTabs.find((tab) => tab.key === activeTab);
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2 mb-3">
      <div className="flex items-center gap-1 overflow-x-auto">
        {ALL_TABS.filter((tab) => PRIMARY_TABS.has(tab.key)).map((tab) => (
          <TabBtn
            key={tab.key}
            tab={tab}
            active={activeTab === tab.key}
            onClick={() => selectTab(tab.key)}
          />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0">
              <MoreHorizontal className="size-4" />
              {activeMore ? t(activeMore.labelKey) : t('More')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {moreTabs.map((tab) => (
              <DropdownMenuItem
                key={tab.key}
                className={activeTab === tab.key ? 'bg-hover text-fg' : undefined}
                onClick={() => selectTab(tab.key)}
              >
                {t(tab.labelKey)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
const TAB_RENDERERS: Record<
  string,
  (c: {
    pf: PortfolioResult[];
    pfs: Portfolio[];
    baseCurrency: string | undefined;
    r: {
      assetTickers?: string[];
      assetCorrelations?: number[][];
      correlations?: number[][];
      portfolios?: PortfolioResult[];
      benchmarkGrowth?: TimeSeriesPoint[];
    };
  }) => ReactNode
> = {
  summary: ({ pf, baseCurrency }) => {
    const f = pf[0];
    const ar = f?.annualReturns ?? [];
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
        <SummarySidebar
          stats={f?.statistics ?? createEmptyStatistics()}
          name={f?.name}
          color={getPortfolioColor(0)}
          totalYears={ar.length}
          positiveYears={ar.filter((r) => r.return > 0).length}
        />
        <div className="space-y-4 min-w-0">
          <L.GrowthChart
            portfolios={pf.map((p) => ({
              id: p.name,
              name: p.name,
              growthCurve: p.growthCurve ?? [],
            }))}
            currency={baseCurrency}
          />
          <L.DrawdownChart portfolios={mapDrawdown(pf)} />
          <StatisticsTable
            {...COMMON_STATS_PROPS(pf)}
            currency={baseCurrency}
            extendedTable={<ExtendedMetricsTable {...COMMON_STATS_PROPS(pf)} />}
          />
          <WithdrawalRatesCard portfolios={pf} />
          <L.DrawdownEpisodes episodes={f?.drawdownEpisodes ?? []} />
        </div>
      </div>
    );
  },
  myMetrics: ({ pf }) => <L.CustomMetricsTable portfolios={pf} />,
  returns: ({ pf }) => (
    <>
      <L.AnnualReturnChart portfolios={pf} />
      {pf.map((x) => (
        <L.MonthlyHeatmap key={x.name} portfolio={x} />
      ))}
    </>
  ),
  yearlyReturns: ({ pf, r }) => (
    <L.YearlyReturnsTable portfolios={pf} benchmarkGrowth={r?.benchmarkGrowth} />
  ),
  drawdown: ({ pf }) => <L.UnderwaterCurve portfolios={mapDrawdown(pf)} />,
  rolling: ({ pf }) => <L.RollingReturnChart portfolios={pf} />,
  seasonality: ({ pf }) => <L.SeasonalityChart portfolios={pf} />,
  riskReturn: ({ pf }) => <L.RiskReturnScatter portfolios={pf} />,
  cashflows: () => <L.CashflowsLog parameters={useBacktestStore.getState().parameters} />,
  rebalancing: ({ pfs }) => <RebalancingStats portfolios={pfs} />,
  turnover: ({ pf }) => <L.TurnoverTaxReport portfolios={pf} />,
  allocation: ({ pf, pfs }) => (
    <L.PortfolioAllocationChart
      portfolios={pf.map(
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
  pies: ({ pfs }) => <L.PortfolioPiesChart portfolios={pfs} />,
  correlation: ({ pf, r }) => (
    <L.CorrelationWithBeta
      portfolios={pf}
      assetTickers={r?.assetTickers}
      assetCorrelations={r?.assetCorrelations}
      portfolioCorrelations={r?.correlations}
    />
  ),
  telltale: ({ pf }) => <L.TelltaleChart portfolios={pf} />,
  regression: ({ pf }) => <L.RegressionChart portfolios={pf} />,
};
function exportResultsCSV(results: BacktestResult) {
  const pf = results?.portfolios?.[0];
  if (!pf?.growthCurve?.length) return;
  downloadCSV(
    pf.growthCurve.map((pt, i) => ({
      date: pt.date,
      ...Object.fromEntries(
        results.portfolios.map((p) => [p.name, p.growthCurve[i]?.value?.toFixed(4) ?? '']),
      ),
    })),
    'backtest-results',
  );
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
  const resultsStale = useBacktestStore((s) => s.resultsStale);
  const error = useBacktestStore((s) => s.error);
  const isLoading = useBacktestStore((s) => s.isLoading);
  const runBacktest = useBacktestStore((s) => s.runBacktest);
  const activeTab = useBacktestStore((s) => s.activeTab);
  const portfolios = useBacktestStore((s) => s.portfolios);
  const baseCurrency = useBacktestStore((s) => s.parameters.baseCurrency);
  const enrichSeries = useBacktestStore((s) => s.enrichSeries);
  const hasResults = !!results && results.portfolios.length > 0;
  const prevHasResults = useRef(hasResults);
  useEffect(() => {
    if (hasResults && !prevHasResults.current)
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    prevHasResults.current = hasResults;
  }, [hasResults]);
  const TAB_SERIES = {
    rolling: ['rollingReturns'],
    turnover: ['allocationHistory'],
    allocation: ['allocationHistory'],
    summary: ['drawdownEpisodes'],
  } as const;
  useEffect(() => {
    const series = TAB_SERIES[activeTab as keyof typeof TAB_SERIES];
    if (results && series) void enrichSeries(series as never);
  }, [activeTab, results, enrichSeries]);
  if (!hasResults) {
    return (
      <ResultsShell
        error={error}
        isLoading={isLoading}
        hasResults={false}
        loadingLabel={t('Backtesting...')}
        emptyTitle={t(
          'Configure parameters and portfolios, then click "Run Backtest" to see results',
        )}
        onRetry={() => void runBacktest()}
      >
        {null}
      </ResultsShell>
    );
  }
  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} className="mb-2" />}
      {resultsStale && (
        <ErrorBanner
          variant="warning"
          message={
            <span className="flex flex-wrap items-center gap-2">
              {t('Parameters changed. Results are out of date.')}
              <Button size="sm" variant="secondary" onClick={() => void runBacktest()}>
                {t('Run Backtest')}
              </Button>
            </span>
          }
        />
      )}
      <ResultsActionBar
        timeRange={computeTimeRange(results)}
        onExport={(format) =>
          format === 'json'
            ? downloadJSON(results, dateSuffixedFilename('backtest-results', 'json'))
            : exportResultsCSV(results)
        }
      />
      <Card className="p-5">
        <TabBar />
        <Suspense fallback={<TabFallback />}>
          {TAB_RENDERERS[activeTab]?.({
            pf: results.portfolios,
            pfs: portfolios,
            baseCurrency,
            r: results as never,
          })}
        </Suspense>
      </Card>
      <p className="text-xs text-fg-tertiary">
        <Trans i18nKey="stats.survivorshipBiasWarning" components={{ link: <Link to="/help" /> }} />
      </p>
    </div>
  );
}
function RebalancingStats({
  portfolios,
}: {
  portfolios: Array<
    Pick<
      Portfolio,
      'name' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands'
    >
  >;
}) {
  const { t } = useTranslation();
  if (!portfolios.some((p) => p.rebalanceFrequency && p.rebalanceFrequency !== 'none'))
    return (
      <ChartCard title={t('Rebalancing')}>
        <ChartEmptyState message={t('No data')} />
      </ChartCard>
    );
  const columns: SimpleTableColumn<(typeof portfolios)[number]>[] = [
    {
      key: 'name',
      label: t('Portfolio'),
      render: (p, i) => <PortfolioLabel color={getPortfolioColor(i)} name={p.name} />,
    },
    {
      key: 'rebalanceFrequency',
      label: t('Rebalancing Frequency'),
      render: (p) => t(REBALANCE_LABELS[p.rebalanceFrequency] || p.rebalanceFrequency),
    },
    {
      key: 'rebalanceOffset',
      label: t('Offset Days'),
      align: 'right',
      render: (p) => String(p.rebalanceOffset ?? 0),
    },
    {
      key: 'rebalanceThreshold',
      label: t('Deviation Threshold'),
      align: 'right',
      render: (p) => (p.rebalanceFrequency === 'threshold' ? `${p.rebalanceThreshold ?? 5}%` : '-'),
    },
    {
      key: 'rebalanceBands',
      label: t('Rebalancing Bands'),
      render: (p) =>
        p.rebalanceBands?.enabled
          ? t('Deviation Bands: {{absolute}} Absolute / {{relative}} Relative', {
              absolute: p.rebalanceBands.absoluteBand ?? '-',
              relative: p.rebalanceBands.relativeBand ?? '-',
            })
          : t('Deviation Bands Disabled'),
    },
  ];
  return (
    <ChartCard title={t('Rebalancing')}>
      <SimpleTable columns={columns} data={portfolios} rowKey={(p) => p.name} />
    </ChartCard>
  );
}
