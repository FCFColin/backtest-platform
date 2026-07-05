/**
 * @file 战术分配（Tactical Allocation）页面
 * @route /tactical
 */
import { useTacticalPageState } from '../hooks/useTacticalState.js';
import { TacticalParamsPanel } from '../components/tactical/TacticalParams.js';
import { TacticalResultsPanel } from '../components/tactical/TacticalResults.js';
import { TacticalSeoCard } from '../components/tactical/TacticalPresets.js';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';

export default function TacticalPage() {
  const state = useTacticalPageState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">战术分配</h1>
      </div>
      <TacticalSeoCard />
      <ToolPageLayout
        title="战术策略参数"
        params={<TacticalParamsPanel state={state} />}
        results={<TacticalResultsPanel state={state} />}
      />
    </div>
  );
}
