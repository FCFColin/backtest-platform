/**
 * @file 蒙特卡洛结果面板（shadcn Tabs 容器）
 * @description 组合 StatsGrid + shadcn Tabs + 当前 Tab 内容；支持单/双组合展示。
 *   双组合模式下两个组合共享 activeTab 与 distMetric。
 */
import type { MonteCarloResult } from '@backtest/shared';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { DistMetric, ResultTab, PortfolioState, PortfolioMode } from './monteCarloTypes.js';
import { RESULT_TABS } from './monteCarloSharedConstants.js';
import { StatsGrid, PortfolioLabel, McErrorState, McEmptyState } from './MonteCarloShared.js';
import { MonteCarloSummaryTab } from './MonteCarloSummaryTab.js';
import { MonteCarloRangeTab } from './MonteCarloRangeTab.js';
import { MonteCarloSuccessTab } from './MonteCarloSuccessTab.js';
import { MonteCarloDistributionsTab } from './MonteCarloDistributionsTab.js';
import { MonteCarloScenariosTab } from './MonteCarloScenariosTab.js';

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
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as ResultTab)}
        className="w-full"
      >
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
            <MonteCarloRangeTab r={r} startingValue={startingValue} />
          </TabsContent>
          <TabsContent value="success">
            <MonteCarloSuccessTab r={r} />
          </TabsContent>
          <TabsContent value="distributions">
            <MonteCarloDistributionsTab
              r={r}
              distMetric={distMetric}
              setDistMetric={setDistMetric}
              startingValue={startingValue}
            />
          </TabsContent>
          <TabsContent value="scenarios">
            <MonteCarloScenariosTab r={r} startingValue={startingValue} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

/**
 * 蒙特卡洛结果面板：错误态 / 空态 / 单/双组合结果展示。
 * 双组合模式下两个组合共享 activeTab 与 distMetric。
 */
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
