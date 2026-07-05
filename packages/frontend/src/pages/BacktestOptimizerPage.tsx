import { BacktestOptimizerParams } from '../components/backtestOptimizer/BacktestOptimizerParams';
import { BacktestOptimizerResults } from '../components/backtestOptimizer/BacktestOptimizerResults';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { useBacktestOptimizerState } from '../hooks/useBacktestOptimizerState';

export default function BacktestOptimizerPage() {
  const state = useBacktestOptimizerState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">回测优化器</h1>
      </div>
      <ToolPageLayout
        title="参数设置"
        params={<BacktestOptimizerParams state={state} />}
        results={<BacktestOptimizerResults state={state} />}
      />
    </div>
  );
}
