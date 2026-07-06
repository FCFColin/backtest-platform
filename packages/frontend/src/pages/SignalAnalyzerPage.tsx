import { ToolPageLayout } from '../components/layout/ToolPageLayout';
import SignalParamsPanel from '../components/signalAnalyzer/SignalAnalyzerParams.js';
import SignalResultsPanel from '../components/signalAnalyzer/SignalAnalyzerResults.js';
import { useSignalAnalyzerState } from '../hooks/useSignalAnalyzerState.js';

export default function SignalAnalyzerPage() {
  const {
    ticker,
    setTicker,
    indicator,
    setIndicator,
    period,
    setPeriod,
    threshold,
    setThreshold,
    signalType,
    setSignalType,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isLoading,
    error,
    results,
    runAnalysis,
  } = useSignalAnalyzerState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">单信号分析</h1>
      </div>
      <ToolPageLayout
        title="分析参数"
        params={
          <SignalParamsPanel
            ticker={ticker}
            setTicker={setTicker}
            indicator={indicator}
            setIndicator={setIndicator}
            period={period}
            setPeriod={setPeriod}
            threshold={threshold}
            setThreshold={setThreshold}
            signalType={signalType}
            setSignalType={setSignalType}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            isLoading={isLoading}
            runAnalysis={runAnalysis}
          />
        }
        results={<SignalResultsPanel error={error} results={results} isLoading={isLoading} />}
      />
    </div>
  );
}
