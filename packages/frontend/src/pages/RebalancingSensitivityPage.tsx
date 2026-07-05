/**
 * @file 调仓敏感性分析页面
 * @description 对比不同调仓频率（日/周/月/季/年）对投资组合收益与风险的影响
 * @route /rebalancing-sensitivity
 */
import { useRebalancingSensitivityState } from '../components/rebalancingSensitivity/hooks/useRebalancingSensitivityState.js';
import { RebalancingSensitivityParams } from '../components/rebalancingSensitivity/RebalancingSensitivityParams.js';
import { RebalancingSensitivityResults } from '../components/rebalancingSensitivity/RebalancingSensitivityResults.js';
import { RebalancingSensitivityPresets } from '../components/rebalancingSensitivity/RebalancingSensitivityPresets.js';

export default function RebalancingSensitivityPage() {
  const s = useRebalancingSensitivityState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">调仓敏感性分析</h1>
      </div>
      <RebalancingSensitivityPresets />
      <RebalancingSensitivityParams s={s} />
      <RebalancingSensitivityResults s={s} />
    </div>
  );
}
