import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type { MonteCarloResult } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import {
  Card,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/uiComponents';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import { Loader2 } from '@/icons/icons.js';
import { fmtDollar } from '@/utils/format';
import { McParamsPanel } from './MonteCarloParams.js';
import type {
  DistMetric,
  McState,
  PortfolioMode,
  PortfolioState,
  ResultTab,
} from './monteCarloUtils.js';
import {
  RESULT_TABS,
  SUMMARY_STATS,
  buildPresets,
  buildSummaryData,
  useMonteCarloState,
} from './monteCarloUtils.js';
const MonteCarloRangeTab = lazy(() =>
  import('./MonteCarloRangeTab.js').then((m) => ({ default: m.MonteCarloRangeTab })),
);
const MonteCarloSuccessTab = lazy(() =>
  import('./MonteCarloSuccessTab.js').then((m) => ({ default: m.MonteCarloSuccessTab })),
);
const MonteCarloDistributionsTab = lazy(() =>
  import('./MonteCarloDistributionsTab.js').then((m) => ({
    default: m.MonteCarloDistributionsTab,
  })),
);
const MonteCarloScenariosTab = lazy(() =>
  import('./MonteCarloScenariosTab.js').then((m) => ({ default: m.MonteCarloScenariosTab })),
);
function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-md bg-input-bg p-3.5 text-center">
      <div className="mb-1 text-caption text-fg-tertiary">{label}</div>
      <div
        className="font-mono text-h3 font-semibold tabular-nums text-fg"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
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
      <StatCard
        label={t('monteCarlo.results.medianFinalValue')}
        value={fmtDollar(r.statistics.medianFinalValue * startingValue)}
      />
      <StatCard
        label={t('monteCarlo.results.meanFinalValue')}
        value={fmtDollar(r.statistics.meanFinalValue * startingValue)}
      />
      <StatCard
        label={t('monteCarlo.results.preservationRate')}
        value={`${(r.statistics.successRate * 100).toFixed(1)}%`}
        color="hsl(var(--success))"
      />
      <StatCard
        label={t('monteCarlo.results.numSimulations')}
        value={`${r.perPathMetrics?.length ?? numSimulations}`}
      />
    </div>
  );
}
export function PortfolioLabel({ label, colorIdx }: { label: string; colorIdx: number }) {
  return (
    <div className="mb-3 mt-2 text-h3 font-semibold" style={{ color: CHART_COLORS[colorIdx] }}>
      {label}
    </div>
  );
}
export function McErrorState({ error }: { error: string }) {
  const { t } = useTranslation();
  return (
    <div className="p-6 text-center text-danger">
      {t('monteCarlo.results.simFailed')}: {error}
    </div>
  );
}
export function McEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="p-12 text-center text-fg-tertiary">{t('monteCarlo.results.noResultsHint')}</div>
  );
}
export function MonteCarloSummaryTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const rows = buildSummaryData(r, startingValue, t);
  if (!rows) {
    return (
      <Card className="p-5">
        <div className="py-6 text-center text-caption text-fg-tertiary">
          {t('monteCarlo.results.noData')}
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead>
            <tr>
              <th className="border-b-2 border-border-strong px-3 py-2 text-left text-caption font-semibold text-fg-tertiary">
                {t('monteCarlo.results.metric')}
              </th>
              {SUMMARY_STATS.map((s) => (
                <th
                  key={s}
                  className="border-b-2 border-border-strong px-3 py-2 text-right text-caption font-semibold text-fg-tertiary"
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="border-b border-border-subtle px-3 py-2 text-label font-medium text-fg">
                  {row.metric}
                </td>
                {SUMMARY_STATS.map((s) => (
                  <td
                    key={s}
                    className="border-b border-border-subtle px-3 py-2 text-right font-mono tabular-nums text-fg-secondary"
                  >
                    {row.values[s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
// eslint-disable-next-line max-lines-per-function -- 合并页面内多区块渲染，内聚保留
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
            <Suspense
              fallback={
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
              }
            >
              <MonteCarloRangeTab r={r} startingValue={startingValue} />
            </Suspense>
          </TabsContent>
          <TabsContent value="success">
            <Suspense
              fallback={
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
              }
            >
              <MonteCarloSuccessTab r={r} />
            </Suspense>
          </TabsContent>
          <TabsContent value="distributions">
            <Suspense
              fallback={
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
              }
            >
              <MonteCarloDistributionsTab
                r={r}
                distMetric={distMetric}
                setDistMetric={setDistMetric}
                startingValue={startingValue}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="scenarios">
            <Suspense
              fallback={
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                </div>
              }
            >
              <MonteCarloScenariosTab r={r} startingValue={startingValue} />
            </Suspense>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
export function MonteCarloResultsPanel({
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
}: {
  error: string | null;
  results1: MonteCarloResult | null;
  results2: MonteCarloResult | null;
  portfolios: PortfolioState[];
  portfolioMode: PortfolioMode;
  activeTab: ResultTab;
  setActiveTab: (tab: ResultTab) => void;
  startingValue: number;
  numSimulations: number;
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
}) {
  if (error) return <McErrorState error={error} />;
  if (!results1 && !results2) return <McEmptyState />;
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
function McParamsWrapper({ state }: { state: McState }) {
  return <McParamsPanel s={state} />;
}
function McResultsWrapper({ state }: { state: McState }) {
  return (
    <MonteCarloResultsPanel
      error={state.error}
      results1={state.results1}
      results2={state.results2}
      portfolios={state.portfolios}
      portfolioMode={state.portfolioMode}
      activeTab={state.activeTab}
      setActiveTab={state.setActiveTab}
      startingValue={state.startingValue}
      numSimulations={state.numSimulations}
      distMetric={state.distMetric}
      setDistMetric={state.setDistMetric}
    />
  );
}
const config: ComputeToolConfig<McState> = {
  titleKey: 'monteCarlo.title',
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
  params: McParamsWrapper,
  results: McResultsWrapper,
};
export default function MonteCarloPage() {
  const s = useMonteCarloState();
  return <ComputeToolShell config={config} state={s} />;
}
