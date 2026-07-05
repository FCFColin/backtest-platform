import { ToolPageLayout } from '../components/layout/ToolPageLayout.js';
import { useTacticalGridState } from '../hooks/useTacticalGridState.js';
import GridParamsPanel from '../components/tacticalGrid/TacticalGridParams.js';
import GridResultsPanel from '../components/tacticalGrid/TacticalGridResults.js';

export default function TacticalGridPage() {
  const state = useTacticalGridState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">战术网格搜索</h1>
      </div>
      <ToolPageLayout
        title="参数设置"
        params={<GridParamsPanel state={state} />}
        results={<GridResultsPanel state={state} />}
      />
    </div>
  );
}
