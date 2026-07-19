/**
 * 工具页面路由组 — 回测/分析/优化/战术等核心工具页面。
 */
import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

const BacktestPage = lazy(() => import('@/pages/backtest/BacktestPage'));
const AnalysisPage = lazy(() => import('@/pages/analysis/AnalysisPage'));
const MonteCarloPage = lazy(() => import('@/pages/monte-carlo/MonteCarloPage'));
const OptimizerPage = lazy(() => import('@/pages/optimizer/OptimizerPage'));
const EfficientFrontierPage = lazy(
  () => import('@/pages/efficient-frontier/EfficientFrontierPage'),
);
const DataEnginePage = lazy(() => import('@/pages/data-engine/DataEnginePage'));
const RebalancingSensitivityPage = lazy(
  () => import('@/pages/rebalancing-sensitivity/RebalancingSensitivityPage'),
);
const LumpSumVsDCAPage = lazy(() => import('@/pages/lump-sum-dca/LumpSumVsDCAPage'));
const FactorRegressionPage = lazy(() => import('@/pages/factor-regression/FactorRegressionPage'));
const CalculatorsPage = lazy(() => import('@/pages/calculators/CalculatorsPage'));
const TacticalPage = lazy(() => import('@/pages/tactical/TacticalPage'));
const BacktestOptimizerPage = lazy(() => import('@/pages/backtest/BacktestOptimizerPage'));
const PCAPage = lazy(() => import('@/pages/pca/PCAPage'));
const SignalAnalyzerPage = lazy(() => import('@/pages/signal/SignalAnalyzerPage'));
const DualSignalPage = lazy(() => import('@/pages/signal/DualSignalPage'));
const MultiSignalPage = lazy(() => import('@/pages/signal/MultiSignalPage'));
const LETFSlippagePage = lazy(() => import('@/pages/letf/LETFSlippagePage'));
const TacticalGridPage = lazy(() => import('@/pages/tactical/TacticalGridPage'));
const GoalOptimizerPage = lazy(() => import('@/pages/goal-optimizer/GoalOptimizerPage'));

const fallback = (
  <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
    {/* loading */}
  </div>
);

export function ToolRoutes() {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route path="/" element={<BacktestPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/monte-carlo" element={<MonteCarloPage />} />
        <Route path="/optimizer" element={<OptimizerPage />} />
        <Route path="/efficient-frontier" element={<EfficientFrontierPage />} />
        <Route path="/data-engine" element={<DataEnginePage />} />
        <Route path="/rebalancing-sensitivity" element={<RebalancingSensitivityPage />} />
        <Route path="/lumpsum-vs-dca" element={<LumpSumVsDCAPage />} />
        <Route path="/factor-regression" element={<FactorRegressionPage />} />
        <Route path="/calculators" element={<CalculatorsPage />} />
        <Route path="/tactical" element={<TacticalPage />} />
        <Route path="/backtest-optimizer" element={<BacktestOptimizerPage />} />
        <Route path="/pca" element={<PCAPage />} />
        <Route path="/signal-analyzer" element={<SignalAnalyzerPage />} />
        <Route path="/dual-signal" element={<DualSignalPage />} />
        <Route path="/multi-signal" element={<MultiSignalPage />} />
        <Route path="/letf-slippage" element={<LETFSlippagePage />} />
        <Route path="/tactical-grid" element={<TacticalGridPage />} />
        <Route path="/goal-optimizer" element={<GoalOptimizerPage />} />
      </Routes>
    </Suspense>
  );
}
