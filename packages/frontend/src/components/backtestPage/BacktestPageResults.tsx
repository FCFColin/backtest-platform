import { useEffect, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/store/backtestStore';
import type { Portfolio, PortfolioResult } from '@backtest/shared';
import type { TabCtx } from './types.js';

import StatisticsTable from '@/components/StatisticsTable';

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
const MonthlyReturnHeatmap = lazy(() => import('@/components/charts/MonthlyReturnHeatmap'));
const CorrelationWithBeta = lazy(() => import('@/components/charts/CorrelationMatrix'));
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

const TAB_RENDERERS: Record<string, (c: TabCtx) => React.ReactNode> = {
  summary: ({ pf }) => (
    <>
      <GrowthChart portfolios={pf} />
      <DrawdownChart portfolios={pf} />
      <StatisticsTable portfolios={pf} />
      <DrawdownEpisodes portfolios={pf} />
    </>
  ),
  metrics: ({ pf }) => <StatisticsTable portfolios={pf} />,
  myMetrics: ({ pf }) => <CustomMetricsTable portfolios={pf} />,
  returns: ({ pf }) => (
    <>
      <AnnualReturnChart portfolios={pf} />
      {pf.map((x) => (
        <MonthlyReturnHeatmap key={x.name} portfolio={x} />
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

function TabBar() {
  const { t } = useTranslation();
  const activeTab = useBacktestStore((s) => s.activeTab);
  const setActiveTab = useBacktestStore((s) => s.setActiveTab);
  return (
    <div className="result-tabs">
      {TAB_GROUPS.map((group) => (
        <div key={group.groupKey} className="result-tab-group">
          <div className="result-tab-group-label">{t(group.groupKey)}</div>
          {group.tabs.map((tab) => (
            <button
              key={tab.key}
              className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function LoadingFallback() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <Loader2 className="w-5 h-5 animate-spin" style={{ display: 'inline-block' }} />
    </div>
  );
}

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
      <div className="bt-results-card card" style={{ textAlign: 'center', padding: 40 }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ display: 'inline-block' }} />
      </div>
    );
  if (!results || results.portfolios.length === 0)
    return (
      <div
        className="bt-results-card card"
        style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}
      >
        {t('backtest.noResults')}
      </div>
    );

  return (
    <div className="bt-results-card card">
      <TabBar />
      <Suspense fallback={<LoadingFallback />}>
        <TabContent
          activeTab={activeTab}
          pfResults={results.portfolios}
          portfolios={portfolios}
          results={results as TabCtx['r']}
        />
      </Suspense>
    </div>
  );
}
