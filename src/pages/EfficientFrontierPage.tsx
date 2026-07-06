import { Link } from 'react-router-dom';
import { FrontierParams } from './EfficientFrontierParams.js';
import type { FrontierParamsProps } from './EfficientFrontierParams.js';
import { FrontierResults } from './EfficientFrontierResults.js';
import type { FrontierResultsProps } from './EfficientFrontierResults.js';
import { useEfficientFrontierState } from './EfficientFrontierUtils.js';

function FrontierSeoCard() {
  return (
    <div className="bt-seo-card card">
      <p className="bt-seo-desc">
        有效前沿工具帮助您从单一"最优"组合扩展到完整的历史测试组合图谱。它生成一系列在收益与风险之间权衡的组合。
      </p>
      <div className="bt-seo-features">
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">可视化</div>
          <div className="bt-seo-feature-desc">
            以散点图展示风险-收益权衡，按夏普比率从红到绿渐变着色，标注最大夏普比率组合，点击查看权重详情。
          </div>
        </div>
        <div className="bt-seo-feature">
          <div className="bt-seo-feature-title">约束条件</div>
          <div className="bt-seo-feature-desc">
            支持调仓频率、现金分配、收益/风险目标、求解器选择、最小包含权重等约束设置。
          </div>
        </div>
      </div>
      <div className="bt-seo-related">
        <span className="bt-seo-related-label">相关工具：</span>
        <Link to="/" className="link-blue" style={{ fontWeight: 700 }}>
          组合回测
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/optimizer" className="link-blue" style={{ fontWeight: 700 }}>
          组合优化
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/analysis" className="link-blue" style={{ fontWeight: 700 }}>
          资产分析
        </Link>
        <span style={{ color: 'var(--text-muted)' }}> · </span>
        <Link to="/monte-carlo" className="link-blue" style={{ fontWeight: 700 }}>
          蒙特卡洛模拟
        </Link>
      </div>
    </div>
  );
}

export default function EfficientFrontierPage() {
  const s = useEfficientFrontierState();

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
