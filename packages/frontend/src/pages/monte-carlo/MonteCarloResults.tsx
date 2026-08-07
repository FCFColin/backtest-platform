import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS, type MonteCarloResult } from '@backtest/shared';
import { lazyNamed } from '@/utils/lazyImport';
import {
  Card,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/uiComponents';
import {
  ComputeToolShell,
  TabFallback,
  type ComputeToolConfig,
} from '../../components/shells/index.js';
import { MiniStatCard } from '../../components/cards.js';
import { fmtDollar } from '@/utils/format';
import { SimpleTable, type SimpleTableColumn } from '@/components/tables.js';
import { McParamsPanel } from './MonteCarloParams.js';
import type { DistMetric, McState, PortfolioMode, ResultTab } from './monteCarloUtils.js';
import { NoDataCard } from './HistogramChart.js';
import {
  RESULT_TABS,
  SUMMARY_STATS,
  buildPresets,
  buildSummaryData,
  useMonteCarloState,
} from './monteCarloUtils.js';
const MonteCarloRangeTab = lazyNamed(() => import('./MonteCarloRangeTab.js'), 'MonteCarloRangeTab');
const MonteCarloSuccessTab = lazyNamed(
  () => import('./MonteCarloRangeTab.js'),
  'MonteCarloSuccessTab',
);
const MonteCarloDistributionsTab = lazyNamed(
  () => import('./MonteCarloScenariosTab.js'),
  'MonteCarloDistributionsTab',
);
const MonteCarloScenariosTab = lazyNamed(
  () => import('./MonteCarloScenariosTab.js'),
  'MonteCarloScenariosTab',
);
export function StatsGrid({
  r,
  startingValue,
  numSimulations,
}: {
  r: MonteCarloResult;
  startingValue: number;
  numSimulations: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <MiniStatCard
        label={t('Median Final Value')}
        value={fmtDollar(r.statistics.medianFinalValue * startingValue)}
      />
      <MiniStatCard
        label={t('Mean Final Value')}
        value={fmtDollar(r.statistics.meanFinalValue * startingValue)}
      />
      <MiniStatCard
        label={t('Capital Preservation')}
        value={`${(r.statistics.successRate * 100).toFixed(1)}%`}
        color="hsl(var(--success))"
      />
      <MiniStatCard
        label={t('Simulation Count')}
        value={`${r.perPathMetrics?.length ?? numSimulations}`}
      />
    </div>
  );
}
function PortfolioLabel({ label, colorIdx }: { label: string; colorIdx: number }) {
  return (
    <div className="mb-3 mt-2 text-h3 font-semibold" style={{ color: CHART_COLORS[colorIdx] }}>
      {label}
    </div>
  );
}
function MonteCarloSummaryTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const rows = buildSummaryData(r, startingValue, t);
  if (!rows) return <NoDataCard />;
  const columns: SimpleTableColumn<(typeof rows)[number]>[] = [
    { key: 'metric', label: t('Metric'), render: (row) => row.metric },
    ...SUMMARY_STATS.map((s) => ({
      key: s,
      label: s,
      align: 'right' as const,
      render: (row: (typeof rows)[number]) => row.values[s],
    })),
  ];
  return (
    <Card className="p-5">
      <SimpleTable columns={columns} data={rows} rowKey={(row) => row.key} />
    </Card>
  );
}
function ResultsDisplay({
  r,
  label,
  colorIdx,
  portfolioMode,
  activeTab,
  startingValue,
  numSimulations,
  distMetric,
  setDistMetric,
  onTabChange,
}: {
  r: MonteCarloResult;
  label: string;
  colorIdx: number;
  portfolioMode: PortfolioMode;
  activeTab: ResultTab;
  startingValue: number;
  numSimulations: number;
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
  onTabChange: (tab: ResultTab) => void;
}) {
  return (
    <div key={label}>
      {portfolioMode === 2 && <PortfolioLabel label={label} colorIdx={colorIdx} />}
      <StatsGrid r={r} startingValue={startingValue} numSimulations={numSimulations} />
      <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as ResultTab)} className="w-full">
        <TabsList className="mb-4 flex-wrap">
          {RESULT_TABS.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-h-[300px]">
          <TabsContent value="summary">
            <MonteCarloSummaryTab r={r} startingValue={startingValue} />
          </TabsContent>
          <TabsContent value="range">
            <Suspense fallback={<TabFallback />}>
              <MonteCarloRangeTab r={r} startingValue={startingValue} />
            </Suspense>
          </TabsContent>
          <TabsContent value="success">
            <Suspense fallback={<TabFallback />}>
              <MonteCarloSuccessTab r={r} />
            </Suspense>
          </TabsContent>
          <TabsContent value="distributions">
            <Suspense fallback={<TabFallback />}>
              <MonteCarloDistributionsTab
                r={r}
                distMetric={distMetric}
                setDistMetric={setDistMetric}
                startingValue={startingValue}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="scenarios">
            <Suspense fallback={<TabFallback />}>
              <MonteCarloScenariosTab r={r} startingValue={startingValue} />
            </Suspense>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
function MonteCarloResultsPanel({ s }: { s: McState }) {
  const {
    error,
    results1,
    results2,
    portfolios,
    portfolioMode,
    activeTab,
    setActiveTab,
    startingValue,
    numSimulations,
    distMetric,
    setDistMetric,
  } = s;
  const { t } = useTranslation();
  if (error) {
    return (
      <div className="p-6 text-center text-danger">
        {t('Simulation failed')}: {error}
      </div>
    );
  }
  if (!results1 && !results2) {
    return (
      <div className="p-12 text-center text-fg-tertiary">
        {t('Configure parameters on the left and click "Start Simulation" to see results')}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {results1 && (
        <ResultsDisplay
          r={results1}
          label={portfolios[0].name}
          colorIdx={0}
          portfolioMode={portfolioMode}
          activeTab={activeTab}
          startingValue={startingValue}
          numSimulations={numSimulations}
          distMetric={distMetric}
          setDistMetric={setDistMetric}
          onTabChange={setActiveTab}
        />
      )}
      {results2 && (
        <>
          <Separator />
          <ResultsDisplay
            r={results2}
            label={portfolios[1].name}
            colorIdx={1}
            portfolioMode={portfolioMode}
            activeTab={activeTab}
            startingValue={startingValue}
            numSimulations={numSimulations}
            distMetric={distMetric}
            setDistMetric={setDistMetric}
            onTabChange={setActiveTab}
          />
        </>
      )}
    </div>
  );
}
const config: ComputeToolConfig<McState> = {
  titleKey: 'nav.monteCarlo',
  seoDescKey: 'monteCarlo.seoDesc',
  seoFeatures: [
    { titleKey: 'monteCarlo.seoSimulatable', descKey: 'monteCarlo.seoSimulatableDesc' },
    { titleKey: 'monteCarlo.seoOutput', descKey: 'monteCarlo.seoOutputDesc' },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.efficientFrontier', href: '/efficient-frontier' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
  ],
  presets: buildPresets,
  params: ({ state }: { state: McState }) => <McParamsPanel s={state} />,
  results: ({ state }: { state: McState }) => <MonteCarloResultsPanel s={state} />,
};
export default function MonteCarloPage() {
  const s = useMonteCarloState();
  return <ComputeToolShell config={config} state={s} />;
}
