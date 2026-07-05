import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import { DualSignalParamsPanel } from '../components/dualSignal/DualSignalParams.js';
import { DualSignalResultsPanel } from '../components/dualSignal/DualSignalResults.js';
import { useDualSignalState } from '../hooks/useDualSignalState';

export default function DualSignalPage() {
  const state = useDualSignalState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">双信号对比</h1>
      </div>
      <ToolPageLayout
        title="分析参数"
        params={
          <DualSignalParamsPanel
            cfg1={state.cfg1}
            cfg2={state.cfg2}
            combinationMethod={state.combinationMethod}
            ticker={state.ticker}
            startDate={state.startDate}
            endDate={state.endDate}
            isLoading={state.isLoading}
            onCfg1Change={state.setCfg1}
            onCfg2Change={state.setCfg2}
            onCombinationMethodChange={state.setCombinationMethod}
            onTickerChange={state.setTicker}
            onStartDateChange={state.setStartDate}
            onEndDateChange={state.setEndDate}
            onRun={state.runAnalysis}
          />
        }
        results={
          <DualSignalResultsPanel
            results={state.results}
            error={state.error}
            isLoading={state.isLoading}
          />
        }
      />
    </div>
  );
}
