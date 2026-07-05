import { useMultiSignalState } from '../hooks/useMultiSignalState';
import MultiSignalParamsPanel from '../components/multiSignal/MultiSignalParams';
import MultiSignalResultsPanel from '../components/multiSignal/MultiSignalResults';
import { ToolPageLayout } from '../components/layout/ToolPageLayout';

export default function MultiSignalPage() {
  const s = useMultiSignalState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">多信号聚合</h1>
      </div>
      <ToolPageLayout
        title="分析参数"
        params={
          <MultiSignalParamsPanel
            signals={s.signals}
            weights={s.weights}
            aggregationMethod={s.aggregationMethod}
            ticker={s.ticker}
            startDate={s.startDate}
            endDate={s.endDate}
            isLoading={s.isLoading}
            onAddSignal={s.addSignal}
            onRemoveSignal={s.removeSignal}
            onUpdateSignal={s.updateSignal}
            onUpdateWeight={s.updateWeight}
            onAggregationMethodChange={s.setAggregationMethod}
            onTickerChange={s.setTicker}
            onStartDateChange={s.setStartDate}
            onEndDateChange={s.setEndDate}
            onRun={s.runAnalysis}
          />
        }
        results={
          <MultiSignalResultsPanel results={s.results} error={s.error} isLoading={s.isLoading} />
        }
      />
    </div>
  );
}
