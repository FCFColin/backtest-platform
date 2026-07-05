/**
 * @file 有效前沿页面
 * @description 基于 Markowitz 或 NSGA-II 求解器计算投资组合有效前沿，展示风险收益散点及夏普比率着色
 * @route /efficient-frontier
 */
import { useNavigate } from 'react-router-dom';
import { useEfficientFrontierState } from '../components/efficientFrontier/useEfficientFrontierState.js';
import FrontierParams from '../components/efficientFrontier/EfficientFrontierParams.js';
import FrontierResults from '../components/efficientFrontier/EfficientFrontierResults.js';
import { FrontierSeoCard } from '../components/efficientFrontier/EfficientFrontierPresets.js';

export default function EfficientFrontierPage() {
  const navigate = useNavigate();
  const s = useEfficientFrontierState(navigate);

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">有效前沿</h1>
      </div>
      <FrontierSeoCard />
      <FrontierParams
        tickers={s.tickers}
        startDate={s.startDate}
        endDate={s.endDate}
        numPoints={s.numPoints}
        solveSpeed={s.solveSpeed}
        minInclusionWeight={s.minInclusionWeight}
        rebalanceFrequency={s.rebalanceFrequency}
        allowCash={s.allowCash}
        returnObjective={s.returnObjective}
        solver={s.solver}
        onAddTicker={s.addTicker}
        onRemoveTicker={s.removeTicker}
        onUpdateTicker={s.updateTicker}
        onStartDateChange={s.setStartDate}
        onEndDateChange={s.setEndDate}
        onNumPointsChange={s.setNumPoints}
        onSolveSpeedChange={s.setSolveSpeed}
        onMinInclusionWeightChange={s.setMinInclusionWeight}
        onRebalanceFrequencyChange={s.setRebalanceFrequency}
        onAllowCashChange={s.setAllowCash}
        onReturnObjectiveChange={s.setReturnObjective}
        onSolverChange={s.setSolver}
        isLoading={s.isLoading}
        onRun={s.runFrontier}
      />
      {s.error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
        >
          计算失败：{s.error}
        </div>
      )}
      {s.correlationError && !s.error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--warning, #f59e0b)', textAlign: 'center', padding: 16 }}
        >
          {s.correlationError}
        </div>
      )}
      {s.results && s.results.frontier.length > 0 && (
        <FrontierResults
          results={s.results}
          scatterData={s.scatterData}
          sharpeRange={s.sharpeRange}
          maxSharpe={s.maxSharpe}
          allocationData={s.allocationData}
          allAssetTickers={s.allAssetTickers}
          correlations={s.correlations}
          correlationError={s.correlationError}
          selectedPoint={s.selectedPoint}
          rebalanceFrequency={s.rebalanceFrequency}
          allowCash={s.allowCash}
          returnObjective={s.returnObjective}
          solver={s.solver}
          onSelectPoint={s.setSelectedPoint}
          onLoadInBacktester={s.handleLoadInBacktester}
        />
      )}
    </div>
  );
}
