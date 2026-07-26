/**
 * @file 回测结果展示区
 * @description 包含 Tab 导航、各 Tab 内容渲染器（懒加载图表/表格）以及空/加载态。
 *   ResultsContent 订阅 backtestStore 的 results/isLoading/activeTab/portfolios，
 *   按 activeTab 选择对应渲染器并按需触发 enrichSeries 拉取扩展数据。
 *   基于 shadcn Card / Button + token 类名。
 */
import { useEffect, lazy, Suspense, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import StatisticsTable from '@/components/StatisticsTable';
import type { Portfolio, PortfolioResult } from '@backtest/shared';

const GrowthChart = lazy(() => import('@/components/charts/GrowthChart'));
const DrawdownChart = lazy(() => import('@/components/charts/DrawdownChart'));
const ReturnsTabDailyChart = lazy(() => import('@/components/charts/ReturnsTabDailyChart'));
const TelltaleChart = lazy(() => import('@/components/charts/TelltaleChart'));
const RiskReturnScatter = lazy(() => import('@/components/charts/RiskReturnScatter'));
const SeasonalityChart = lazy(() => import('@/components/charts/SeasonalityChart'));
const RegressionChart = lazy(() => import('@/components/charts/RegressionChart'));
const PortfolioAllocationChart = lazy(() => import('@/components/charts/PortfolioAllocationChart'));
const PortfolioPiesChart = lazy(() => import('@/components/charts/PortfolioPiesChart'));
const RollingReturnChart = lazy(() => import('@/components/charts/RollingReturnChart'));
const AnnualReturnChart = lazy(() => import('@/components/charts/AnnualReturnChart'));
const MonthlyHeatmap = lazy(() => import('@/components/charts/MonthlyHeatmap'));
const CorrelationWithBeta = lazy(() => import('@/components/charts/CorrelationHeatmapChart'));
const CustomMetricsTable = lazy(() => import('@/components/CustomMetricsTable'));
const DrawdownEpisodes = lazy(() => import('@/components/DrawdownEpisodes'));
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
      { key: 'rolling', labelKey: 'tabs.rolling' },
      { key: 'seasonality', labelKey: 'tabs.seasonality' },
      { key: 'riskReturn', labelKey: 'tabs.riskReturn' },
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

function TabBar() {
  const { t } = useTranslation();
  const activeTab = useBacktestStore((s) => s.activeTab);
  const setActiveTab = useBacktestStore((s) => s.setActiveTab);

  const handleExport = () => {
    const results = useBacktestStore.getState().results;
    if (!results?.portfolios?.length) return;

    const pf = results.portfolios[0];
    if (!pf?.growthCurve?.length) return;

    const headers = ['date', ...results.portfolios.map((p) => p.name)];
    const rows: string[][] = [];
    const dates = pf.growthCurve.map((pt) => new Date(pt.date).toISOString().split('T')[0]);

    dates.forEach((date, i) => {
      const row = [date];
      results.portfolios.forEach((p) => {
        row.push(p.growthCurve[i]?.value?.toFixed(4) ?? '');
      });
      rows.push(row);
    });

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    link.download = `backtest-results-${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
  };
};

const TAB_RENDERERS: Record<string, (c: TabCtx) => ReactNode> = {
  summary: ({ pf }) => (
    <>
      <GrowthChart portfolios={pf} />
      <DrawdownChart portfolios={pf} />
      <StatisticsTable portfolios={pf} horizontal />
      <DrawdownEpisodes portfolios={pf} />
    </>
  ),
  metrics: ({ pf }) => <StatisticsTable portfolios={pf} />,
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

function TabContent({
  activeTab,
  pfResults,
  portfolios,
  results,
}: {
  activeTab: string;
  pfResults: PortfolioResult[];
  portfolios: Portfolio[];
  results: TabCtx['r'];
}) {
  const renderer = TAB_RENDERERS[activeTab];
  return renderer ? <>{renderer({ pf: pfResults, pfs: portfolios, r: results })}</> : null;
}

/**
 * 回测结果展示区：根据 activeTab 选择渲染器，按需触发 enrichSeries。
 * 加载中且无结果时显示加载占位；无结果时显示空态文案。
 * @returns 渲染的结果展示区
 */
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

  return (
    <Card className="p-5">
      <TabBar />
      <Suspense fallback={<LoadingFallback />}>
        <TabContent
          activeTab={activeTab}
          pfResults={results.portfolios}
          portfolios={portfolios}
          results={results as TabCtx['r']}
        />
      </Suspense>
    </Card>
  );
}
