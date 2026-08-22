import { useEffect, useRef, useState, Suspense, type ReactNode } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { MoreHorizontal, Download } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import * as U from '@/components/ui/uiComponents';
import * as ST from '@/components/statistics-table/StatisticsTable.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import * as F from '@/utils/format';
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
const SCLS =
  'sticky top-15 z-40 h-14 bg-sticky-bg/95 backdrop-blur-md border-b border-border shadow-md';
const ICLS = 'h-14 bg-transparent border-b border-border-subtle';
const ROWCLS = 'flex items-center justify-between gap-3';
const DTCLS = 'text-caption text-fg-tertiary whitespace-nowrap';
const DDCLS = 'text-caption font-mono tabular-nums font-semibold text-right';
const CARDMCLS = 'flex-shrink-0 min-w-[130px] p-3';
const LBLCLS = 'text-label-tiny text-fg-tertiary mb-1 whitespace-nowrap';
const VALCLS = 'text-body font-mono tabular-nums font-semibold';
const ACTCLS = 'shrink-0 text-brand border-b-2 border-brand rounded-b-none';
const BAND_KEY = 'Deviation Bands: {{absolute}} Absolute / {{relative}} Relative';
function ResultsActionBar({
  timeRange: r,
  onExport: o,
}: {
  timeRange: { start: string; end: string; years: number };
  onExport?: (f: 'csv' | 'json') => void;
}) {
  const { t } = useTranslation();
  const [sticky, setSticky] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ob = new IntersectionObserver(([e]) => setSticky(!e.isIntersecting), { threshold: 0 });
    if (ref.current) ob.observe(ref.current);
    return () => ob.disconnect();
  }, []);
  const y = Number.isInteger(r.years) ? r.years : +r.years.toFixed(1);
  return (
    <>
      <div ref={ref} className="h-0" />
      <div className={cn('transition-all duration-200', sticky ? SCLS : ICLS)}>
        <div className="max-w-[1440px] mx-auto h-full px-6 flex items-center gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-h3">{t('Results')}</h2>
            <span className="text-caption text-fg-tertiary font-mono tabular-nums">
              {t('{{years}} yrs · {{start}} to {{end}}', {
                years: y,
                start: F.formatISODate(r.start),
                end: F.formatISODate(r.end),
              })}
            </span>
          </div>
          <div className="flex-1" />
          <U.DropdownMenu>
            <U.DropdownMenuTrigger asChild>
              <U.Button variant="secondary" size="sm">
                <Download className="h-4 w-4 mr-1.5" />
                {t('Export')}
              </U.Button>
            </U.DropdownMenuTrigger>
            <U.DropdownMenuContent align="end">
              <U.DropdownMenuItem onClick={() => o?.('csv')}>{t('CSV (Data)')}</U.DropdownMenuItem>
              <U.DropdownMenuItem onClick={() => o?.('json')}>
                {t('JSON (Full Config + Results)')}
              </U.DropdownMenuItem>
            </U.DropdownMenuContent>
          </U.DropdownMenu>
        </div>
      </div>
    </>
  );
}
const SUMMARY_METRIC_CONFIGS: [string, keyof Statistics, (v: number) => string, string][] = [
  ['stats.cagr', 'cagr', F.fmtPct, 'summary-cagr'],
  ['stats.totalReturn', 'totalReturn', F.fmtPct, 'summary-total-return'],
  ['Max Drawdown', 'maxDrawdown', F.fmtPct, 'summary-max-drawdown'],
  ['backtest.sharpeRatio', 'sharpe', F.fmtNum, 'summary-sharpe'],
  ['lumpSumDca.stats.sortino', 'sortino', F.fmtNum, 'summary-sortino'],
  ['summarySidebar.bestYear', 'bestYear', F.fmtPct, 'summary-best-year'],
  ['summarySidebar.worstYear', 'worstYear', F.fmtPct, 'summary-worst-year'],
];
function SummarySidebar({
  stats: s,
  totalYears: ty,
  positiveYears: py,
  name,
  color,
}: {
  stats: Statistics;
  totalYears: number;
  positiveYears: number;
  name?: string;
  color?: string;
}) {
  const { t } = useTranslation();
  const m = SUMMARY_METRIC_CONFIGS.map(([k, key, f, id]) => ({
    labelKey: k,
    value: f(s[key] as number),
    colorClass: getColorClass(s[key] as number),
    testId: id,
  })).concat({
    labelKey: 'summarySidebar.positiveYears',
    value: `${py} / ${ty}`,
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
        {m.map((x) => (
          <U.Card key={x.labelKey} role="listitem" className={CARDMCLS} data-testid={x.testId}>
            <div className={LBLCLS}>{t(x.labelKey)}</div>
            <div className={cn(VALCLS, x.colorClass)}>{x.value}</div>
          </U.Card>
        ))}
      </div>
      <U.Card className="hidden lg:block p-4 lg:sticky lg:top-15" data-testid="summary-sidebar">
        <h3 className="text-h3 mb-3">{t('Key Metrics')}</h3>
        {name && (
          <div className="flex items-center gap-1.5 mb-3">
            <U.PortfolioDot color={color ?? ''} className="shrink-0" />
            <span className="text-caption text-fg-secondary truncate">{name}</span>
          </div>
        )}
        <dl className="space-y-2.5">
          {m.map((x) => (
            <div key={x.labelKey} className={ROWCLS} data-testid={x.testId}>
              <dt className={DTCLS}>{t(x.labelKey)}</dt>
              <dd className={cn(DDCLS, x.colorClass)}>{x.value}</dd>
            </div>
          ))}
        </dl>
      </U.Card>
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
const toCommon = (pf: PortfolioResult[]) => ({
  portfolios: pf.map((p) => ({ id: p.name, name: p.name, stats: toStatsRecord(p.statistics) })),
  colors: pf.map((_, i) => getPortfolioColor(i)),
});
const mapDD = (pf: PortfolioResult[]) =>
  pf.map((p) => ({
    id: p.name,
    name: p.name,
    drawdownCurve: (p.drawdownCurve ?? []).map((pt) => ({ date: pt.date, drawdown: pt.drawdown })),
  }));
function TabBar() {
  const { t } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const urlTab = sp.get('tab');
  const active = useBacktestStore((s) => s.activeTab);
  const setActive = useBacktestStore((s) => s.setActiveTab);
  useEffect(() => {
    if (urlTab && urlTab !== active) setActive(urlTab);
  }, [urlTab, active, setActive]);
  const sel = (tab: string) => {
    if (tab === active) return;
    setActive(tab);
    const n = new URLSearchParams(sp);
    n.set('tab', tab);
    setSp(n);
  };
  const more = ALL_TABS.filter((x) => !PRIMARY_TABS.has(x.key));
  const actMore = more.find((x) => x.key === active);
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2 mb-3">
      <div className="flex items-center gap-1 overflow-x-auto">
        {ALL_TABS.filter((x) => PRIMARY_TABS.has(x.key)).map((x) => (
          <U.Button
            key={x.key}
            variant={active === x.key ? 'secondary' : 'ghost'}
            size="sm"
            className={active === x.key ? ACTCLS : 'shrink-0'}
            aria-pressed={active === x.key}
            onClick={() => sel(x.key)}
          >
            {t(x.labelKey)}
          </U.Button>
        ))}
        <U.DropdownMenu>
          <U.DropdownMenuTrigger asChild>
            <U.Button variant="ghost" size="sm" className="shrink-0">
              <MoreHorizontal className="size-4" />
              {actMore ? t(actMore.labelKey) : t('More')}
            </U.Button>
          </U.DropdownMenuTrigger>
          <U.DropdownMenuContent align="start">
            {more.map((x) => (
              <U.DropdownMenuItem
                key={x.key}
                className={active === x.key ? 'bg-hover text-fg' : undefined}
                onClick={() => sel(x.key)}
              >
                {t(x.labelKey)}
              </U.DropdownMenuItem>
            ))}
          </U.DropdownMenuContent>
        </U.DropdownMenu>
      </div>
    </div>
  );
}
type Ctx = { pf: PortfolioResult[]; pfs: Portfolio[]; baseCurrency?: string; r: BacktestResult };
const TAB_RENDERERS: Record<string, (c: Ctx) => ReactNode> = {
  summary: ({ pf, baseCurrency: cur }) => {
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
            currency={cur}
          />
          <L.DrawdownChart portfolios={mapDD(pf)} />
          <ST.StatisticsTable
            {...toCommon(pf)}
            currency={cur}
            extendedTable={<ST.ExtendedMetricsTable {...toCommon(pf)} />}
          />
          <ST.WithdrawalRatesCard portfolios={pf} />
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
  drawdown: ({ pf }) => <L.UnderwaterCurve portfolios={mapDD(pf)} />,
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
export function ResultsContent() {
  const { t } = useTranslation();
  const results = useBacktestStore((s) => s.results);
  const stale = useBacktestStore((s) => s.resultsStale);
  const err = useBacktestStore((s) => s.error);
  const loading = useBacktestStore((s) => s.isLoading);
  const run = useBacktestStore((s) => s.runBacktest);
  const activeTab = useBacktestStore((s) => s.activeTab);
  const pfs = useBacktestStore((s) => s.portfolios);
  const cur = useBacktestStore((s) => s.parameters.baseCurrency);
  const enrich = useBacktestStore((s) => s.enrichSeries);
  const has = !!results && results.portfolios.length > 0;
  const prev = useRef(has);
  useEffect(() => {
    if (has && !prev.current)
      document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    prev.current = has;
  }, [has]);
  const TAB_SERIES = {
    rolling: ['rollingReturns'],
    turnover: ['allocationHistory'],
    allocation: ['allocationHistory'],
    summary: ['drawdownEpisodes'],
  } as const;
  useEffect(() => {
    const s = TAB_SERIES[activeTab as keyof typeof TAB_SERIES];
    if (results && s) void enrich(s as never);
  }, [activeTab, results, enrich]);
  if (!has)
    return (
      <ResultsShell
        error={err}
        isLoading={loading}
        hasResults={false}
        loadingLabel={t('Backtesting...')}
        emptyTitle={t(
          'Configure parameters and portfolios, then click "Run Backtest" to see results',
        )}
        onRetry={() => void run()}
      >
        {null}
      </ResultsShell>
    );
  const g = results.portfolios[0]?.growthCurve;
  const first = g?.[0]?.date;
  const last = g?.[g.length - 1]?.date;
  const years =
    first && last ? (new Date(last).getTime() - new Date(first).getTime()) / 864e5 / 365.25 : 0;
  const range = { start: first ?? '—', end: last ?? '—', years };
  const csvRows = (pf: PortfolioResult) =>
    pf.growthCurve.map((pt, i) => ({
      date: pt.date,
      ...Object.fromEntries(
        results.portfolios.map((p) => [p.name, p.growthCurve[i]?.value?.toFixed(4) ?? '']),
      ),
    }));
  return (
    <div className="space-y-4">
      {err && <ErrorBanner message={err} className="mb-2" />}
      {stale && (
        <ErrorBanner
          variant="warning"
          message={
            <span className="flex flex-wrap items-center gap-2">
              {t('Parameters changed. Results are out of date.')}
              <U.Button size="sm" variant="secondary" onClick={() => void run()}>
                {t('Run Backtest')}
              </U.Button>
            </span>
          }
        />
      )}
      <ResultsActionBar
        timeRange={range}
        onExport={(f) => {
          if (f === 'json')
            F.downloadJSON(results, F.dateSuffixedFilename('backtest-results', 'json'));
          else {
            const pf = results?.portfolios?.[0];
            if (pf?.growthCurve?.length) F.downloadCSV(csvRows(pf), 'backtest-results');
          }
        }}
      />
      <U.Card className="p-5">
        <TabBar />
        <Suspense fallback={<TabFallback />}>
          {TAB_RENDERERS[activeTab]?.({
            pf: results.portfolios,
            pfs,
            baseCurrency: cur,
            r: results as never,
          })}
        </Suspense>
      </U.Card>
      <p className="text-xs text-fg-tertiary">
        <Trans i18nKey="stats.survivorshipBiasWarning" components={{ link: <Link to="/help" /> }} />
      </p>
    </div>
  );
}
function RebalancingStats({
  portfolios: pf,
}: {
  portfolios: Pick<
    Portfolio,
    'name' | 'rebalanceFrequency' | 'rebalanceThreshold' | 'rebalanceOffset' | 'rebalanceBands'
  >[];
}) {
  const { t } = useTranslation();
  if (!pf.some((p) => p.rebalanceFrequency && p.rebalanceFrequency !== 'none'))
    return (
      <ChartCard title={t('Rebalancing')}>
        <ChartEmptyState message={t('No data')} />
      </ChartCard>
    );
  const cols: SimpleTableColumn<(typeof pf)[number]>[] = [
    {
      key: 'name',
      label: t('Portfolio'),
      render: (p, i) => <U.PortfolioLabel color={getPortfolioColor(i)} name={p.name} />,
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
          ? t(BAND_KEY, {
              absolute: p.rebalanceBands.absoluteBand ?? '-',
              relative: p.rebalanceBands.relativeBand ?? '-',
            })
          : t('Deviation Bands Disabled'),
    },
  ];
  return (
    <ChartCard title={t('Rebalancing')}>
      <SimpleTable columns={cols} data={pf} rowKey={(p) => p.name} />
    </ChartCard>
  );
}
