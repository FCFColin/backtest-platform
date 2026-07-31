import type { MonteCarloResult } from '@backtest/shared';
import { Separator } from '@/components/ui/uiComponents';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/uiComponents';
import type { DistMetric, ResultTab, PortfolioState, PortfolioMode } from './monteCarloUtils.js';
import { RESULT_TABS } from './monteCarloUtils.js';
import { StatsGrid, PortfolioLabel, McErrorState, McEmptyState } from './MonteCarloShared.js';
import { lazy, Suspense } from 'react';
import { Loader2 } from '@/icons/icons.js';
import { MonteCarloSummaryTab } from './MonteCarloSummaryTab.js';
const MonteCarloRangeTab = lazy(() => import('./MonteCarloRangeTab.js').then((m) => ({ default: m.MonteCarloRangeTab })));
const MonteCarloSuccessTab = lazy(() => import('./MonteCarloSuccessTab.js').then((m) => ({ default: m.MonteCarloSuccessTab })));
const MonteCarloDistributionsTab = lazy(() => import('./MonteCarloDistributionsTab.js').then((m) => ({ default: m.MonteCarloDistributionsTab })));
const MonteCarloScenariosTab = lazy(() => import('./MonteCarloScenariosTab.js').then((m) => ({ default: m.MonteCarloScenariosTab })));
function ResultsDisplay({ r, label, colorIdx, portfolioMode, activeTab, startingValue, numSimulations, distMetric, setDistMetric, onTabChange }: { r: MonteCarloResult; label: string; colorIdx: number; portfolioMode: PortfolioMode; activeTab: ResultTab; startingValue: number; numSimulations: number; distMetric: DistMetric; setDistMetric: (m: DistMetric) => void; onTabChange: (tab: ResultTab) => void }) {
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
              <MonteCarloDistributionsTab r={r} distMetric={distMetric} setDistMetric={setDistMetric} startingValue={startingValue} />
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
export function MonteCarloResultsPanel({ error, results1, results2, portfolios, portfolioMode, activeTab, setActiveTab, startingValue, numSimulations, distMetric, setDistMetric }: { error: string | null; results1: MonteCarloResult | null; results2: MonteCarloResult | null; portfolios: PortfolioState[]; portfolioMode: PortfolioMode; activeTab: ResultTab; setActiveTab: (tab: ResultTab) => void; startingValue: number; numSimulations: number; distMetric: DistMetric; setDistMetric: (m: DistMetric) => void }) {
  if (error) return <McErrorState error={error} />;
  if (!results1 && !results2) return <McEmptyState />;
  return (
    <div className="flex flex-col gap-6">
      {results1 && <ResultsDisplay r={results1} label={portfolios[0].name} colorIdx={0} portfolioMode={portfolioMode} activeTab={activeTab} startingValue={startingValue} numSimulations={numSimulations} distMetric={distMetric} setDistMetric={setDistMetric} onTabChange={setActiveTab} />}
      {results2 && (
        <>
          <Separator />
          <ResultsDisplay r={results2} label={portfolios[1].name} colorIdx={1} portfolioMode={portfolioMode} activeTab={activeTab} startingValue={startingValue} numSimulations={numSimulations} distMetric={distMetric} setDistMetric={setDistMetric} onTabChange={setActiveTab} />
        </>
      )}
    </div>
  );
}
