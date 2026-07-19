/**
 * @file 蒙特卡洛结果面板（Tab 容器）
 * @description 组合 StatsGrid + TabBar + 当前 Tab 内容；支持单/双组合展示
 */
import type { MonteCarloResult } from '@backtest/shared';
import type { DistMetric, ResultTab, PortfolioState, PortfolioMode } from './monteCarloTypes.js';
import {
  StatsGrid,
  ResultTabBar,
  PortfolioLabel,
  McErrorState,
  McEmptyState,
} from './MonteCarloShared.js';
import { MonteCarloSummaryTab } from './MonteCarloSummaryTab.js';
import { MonteCarloRangeTab } from './MonteCarloRangeTab.js';
import { MonteCarloSuccessTab } from './MonteCarloSuccessTab.js';
import { MonteCarloDistributionsTab } from './MonteCarloDistributionsTab.js';
import { MonteCarloScenariosTab } from './MonteCarloScenariosTab.js';

function TabContent({
  activeTab,
  r,
  startingValue,
  distMetric,
  setDistMetric,
}: {
  activeTab: ResultTab;
  r: MonteCarloResult;
  startingValue: number;
  distMetric: DistMetric;
  setDistMetric: (m: DistMetric) => void;
}) {
  switch (activeTab) {
    case 'summary':
      return <MonteCarloSummaryTab r={r} startingValue={startingValue} />;
    case 'range':
      return <MonteCarloRangeTab r={r} startingValue={startingValue} />;
    case 'success':
      return <MonteCarloSuccessTab r={r} />;
    case 'distributions':
      return (
        <MonteCarloDistributionsTab
          r={r}
          distMetric={distMetric}
          setDistMetric={setDistMetric}
          startingValue={startingValue}
        />
      );
    case 'scenarios':
      return <MonteCarloScenariosTab r={r} startingValue={startingValue} />;
  }
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
      <ResultTabBar activeTab={activeTab} onTabChange={onTabChange} />
      <div style={{ minHeight: 300 }}>
        <TabContent
          activeTab={activeTab}
          r={r}
          startingValue={startingValue}
          distMetric={distMetric}
          setDistMetric={setDistMetric}
        />
      </div>
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
    <div className="bt-results-card card">
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
          <div
            style={{ borderTop: '1px solid var(--border-soft)', marginTop: 24, paddingTop: 8 }}
          />
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
