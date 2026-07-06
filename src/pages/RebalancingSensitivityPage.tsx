/**
 * @file 调仓敏感性分析页面
 * @description 对比不同调仓频率（日/周/月/季/年）对投资组合收益与风险的影响
 * @route /rebalancing-sensitivity
 */
import { useRebalancingState } from './rebalancingSensitivityUtils.js';
import { SeoCard, ParamsPanel, ResultsPanel } from './rebalancingSensitivityComponents.js';

export default function RebalancingSensitivityPage() {
  const s = useRebalancingState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">调仓敏感性分析</h1>
      </div>
      <SeoCard />
      <ParamsPanel s={s} />
      <ResultsPanel s={s} />
    </div>
  );
}
