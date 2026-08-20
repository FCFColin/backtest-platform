import { useEffect, useRef, useState, Suspense, type ReactNode } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { MoreHorizontal, Download } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import {
  Card,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  PortfolioLabel,
  PortfolioDot,
} from '@/components/ui/uiComponents';
import {
  StatisticsTable,
  ExtendedMetricsTable,
  WithdrawalRatesCard,
} from '@/components/statistics-table/StatisticsTable.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import {
  downloadJSON,
  dateSuffixedFilename,
  downloadCSV,
  formatISODate,
  fmtPct,
  fmtNum,
} from '@/utils/format';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import { TabFallback } from '@/components/shells';
import ChartCard from '@/components/ChartCard.js';
import { ResultsShell } from '@/components/resultsShell.js';
import { ChartEmptyState, ErrorBanner } from '@/components/stateDisplay.js';
import { lazyNamed } from '@/utils/lazyImport';
import { cn } from '@/lib/utils';
import { getColorClass } from '@/components/charts/chartUtils.js';
import type { Statistics } from '@backtest/shared';
import {
  type Portfolio,
  type PortfolioResult,
  type BacktestResult,
  REBALANCE_LABELS,
  toStatsRecord,
  createEmptyStatistics,
} from '@backtest/shared';
type RABProps = {
  timeRange: { start: string; end: string; years: number };
  onExport?: (f: 'csv' | 'json') => void;
};
function ResultsActionBar({ timeRange, onExport }: RABProps) {
  const { t } = useTranslation();
  const [sticky, setSticky] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const o = new IntersectionObserver(([e]) => setSticky(!e.isIntersecting), { threshold: 0 });
    if (sentinelRef.current) o.observe(sentinelRef.current);
    return () => o.disconnect();
  }, []);
  const years = Number.isInteger(timeRange.years) ? timeRange.years : +timeRange.years.toFixed(1);
  return (
    <>
      <div ref={sentinelRef} className="h-0" />
      <div
        className={cn(
          'transition-all duration-200',
          sticky
            ? 'sticky top-15 z-40 h-14 bg-sticky-bg/95 backdrop-blur-md border-b border-border shadow-md'
            : 'h-14 bg-transparent border-b border-border-subtle',
        )}
      >
        <div className="max-w-[1440px] mx-auto h-full px-6 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-h3">{t('Results')}</h2>
            <span className="text-caption text-fg-tertiary font-mono tabular-nums">
              {t('{{years}} yrs · {{start}} to {{end}}', {
                years,
                start: formatISODate(timeRange.start),
                end: formatISODate(timeRange.end),
              })}
            </span>
          </div>
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                <Download className="h-4 w-4 mr-1.5" />
                {t('Export')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onExport?.('csv')}>
                {t('CSV (Data)')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport?.('json')}>
                {t('JSON (Full Config + Results)')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}
const SUMMARY_METRIC_CONFIGS: [string, keyof Statistics, (v: number) => string, string][] = [
  ['stats.cagr', 'cagr', fmtPct, 'summary-cagr'],
  ['stats.totalReturn', 'totalReturn', fmtPct, 'summary-total-return'],
  ['Max Drawdown', 'maxDrawdown', fmtPct, 'summary-max-drawdown'],
  ['backtest.sharpeRatio', 'sharpe', fmtNum, 'summary-sharpe'],
  ['lumpSumDca.stats.sortino', 'sortino', fmtNum, 'summary-sortino'],
  ['summarySidebar.bestYear', 'bestYear', fmtPct, 'summary-best-year'],
  ['summarySidebar.worstYear', 'worstYear', fmtPct, 'summary-worst-year'],
];
type SSProps = {
  stats: Statistics;
  totalYears: number;
  positiveYears: number;
  name?: string;
  color?: string;
};
function SummarySidebar({ stats, totalYears, positiveYears, name, color }: SSProps) {
  const { t } = useTranslation();
  const metrics = SUMMARY_METRIC_CONFIGS.map(([labelKey, key, format, testId]) => ({
    labelKey,
    value: format(stats[key] as number),
    colorClass: getColorClass(stats[key] as number),
    testId,
  })).concat({
    labelKey: 'summarySidebar.positiveYears',
    value: `${positiveYears} / ${totalYears}`,
    colorClass: 'text-fg',
    testId: 'summary-positive-years',
  });
  return (
    <>
      <div
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 lg:hidden"
        role="list"
        aria-label={t('Key Metrics')}
      >
        {metrics.map((m) => (
          <Card
            key={m.labelKey}
            role="listitem"
            className="flex-shrink-0 min-w-[130px] p-3"
            data-testid={m.testId}
          >
            <div className="text-label-tiny text-fg-tertiary mb-1 whitespace-nowrap">
              {t(m.labelKey)}
            </div>
            <div className={cn('text-body font-mono tabular-nums font-semibold', m.colorClass)}>
              {m.value}
            </div>
          </Card>
        ))}
      </div>
      <Card className="hidden lg:block p-4 lg:sticky lg:top-15" data-testid="summary-sidebar">
        <h3 className="text-h3 mb-3">{t('Key Metrics')}</h3>
        {name && (
          <div className="flex items-center gap-1.5 mb-3">
            <PortfolioDot color={color ?? ''} className="shrink-0" />
            <span className="text-caption text-fg-secondary truncate">{name}</span>
          </div>
        )}
        <dl className="space-y-2.5">
          {metrics.map((m) => (
            <div
              key={m.labelKey}
              className="flex items-center justify-between gap-3"
              data-testid={m.testId}
            >
              <dt className="text-caption text-fg-tertiary whitespace-nowrap">{t(m.labelKey)}</dt>
              <dd
                className={cn(
                  'text-caption font-mono tabular-nums font-semibold text-right',
                  m.colorClass,
                )}
              >
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
const lz = lazyNamed;
const L = {
  GrowthChart: lz(() => import('@/components/charts/GrowthChart'), 'GrowthChart'),
  DrawdownChart: lz(() => import('@/components/charts/drawdownCharts'), 'DrawdownChart'),
  DrawdownEpisodes: lz(() => import('@/components/results/DrawdownEpisodes'), 'DrawdownEpisodes'),
  YearlyReturnsTable: lz(
    () => import('@/components/results/YearlyReturnsTable'),
    'YearlyReturnsTable',
  ),
  UnderwaterCurve: lz(() => import('@/components/charts/drawdownCharts'), 'UnderwaterCurve'),
  TelltaleChart: lz(() => import('@/components/charts/analysis'), 'TelltaleChart'),
  RiskReturnScatter: lz(() => import('@/components/charts/riskReturn'), 'RiskReturnScatter'),
  SeasonalityChart: lz(() => import('@/components/charts/analysis'), 'SeasonalityChart'),
  RegressionChart: lz(() => import('@/components/charts/RegressionChart'), 'RegressionChart'),
  PortfolioAllocationChart: lz(
    () => import('@/components/charts/portfolioCharts'),
    'PortfolioAllocationChart',
  ),
  PortfolioPiesChart: lz(() => import('@/components/charts/portfolioCharts'), 'default'),
  RollingReturnChart: lz(() => import('@/components/charts/rolling'), 'RollingReturnChart'),
  AnnualReturnChart: lz(() => import('@/components/charts/AnnualReturnChart'), 'AnnualReturnChart'),
  MonthlyHeatmap: lz(() => import('@/components/charts/analysis'), 'MonthlyHeatmap'),
  CorrelationWithBeta: lz(
    () => import('@/components/charts/CorrelationHeatmapChart'),
    'CorrelationWithBeta',
  ),
  CustomMetricsTable: lz(() => import('@/components/CustomMetricsTable'), 'CustomMetricsTable'),
  CashflowsLog: lz(() => import('@/components/CashflowsLog'), 'CashflowsLog'),
  TurnoverTaxReport: lz(() => import('@/components/TurnoverTaxReport'), 'TurnoverTaxReport'),
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
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'secondary' : 'ghost'}
            size="sm"
            className={
              activeTab === tab.key
                ? 'shrink-0 text-brand border-b-2 border-brand rounded-b-none'
                : 'shrink-0'
            }
            aria-pressed={activeTab === tab.key}
            onClick={() => selectTab(tab.key)}
          >
            {t(tab.labelKey)}
          </Button>
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
type Ctx = { pf: PortfolioResult[]; pfs: Portfolio[]; baseCurrency?: string; r: BacktestResult };
const TAB_RENDERERS: Record<string, (c: Ctx) => ReactNode> = {
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
function computeTimeRange(r: BacktestResult) {
  const g = r.portfolios[0]?.growthCurve,
    first = g?.[0]?.date,
    last = g?.[g.length - 1]?.date;
  const years =
    first && last ? (new Date(last).getTime() - new Date(first).getTime()) / 864e5 / 365.25 : 0;
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
        onExport={(format) => {
          if (format === 'json') {
            downloadJSON(results, dateSuffixedFilename('backtest-results', 'json'));
          } else {
            const pf = results?.portfolios?.[0];
            if (pf?.growthCurve?.length) {
              downloadCSV(
                pf.growthCurve.map((pt, i) => ({
                  date: pt.date,
                  ...Object.fromEntries(
                    results.portfolios.map((p) => [
                      p.name,
                      p.growthCurve[i]?.value?.toFixed(4) ?? '',
                    ]),
                  ),
                })),
                'backtest-results',
              );
            }
          }
        }}
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
type RBPortfolios = Pick<
  Portfolio,
  'name' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands'
>;
function RebalancingStats({ portfolios }: { portfolios: RBPortfolios[] }) {
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
