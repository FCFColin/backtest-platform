import { LETFParamsPanel } from '../components/letfSlippage/LETFSlippageParams.js';
import { LETFResultsPanel } from '../components/letfSlippage/LETFSlippageResults.js';
import { LETFSlippagePresets } from '../components/letfSlippage/LETFSlippagePresets.js';
import { useLETFSlippageState } from '../hooks/useLETFSlippageState.js';
import { ToolPageLayout } from '../components/layout/ToolPageLayout.js';

export default function LETFSlippagePage() {
  const {
    letfTicker,
    setLetfTicker,
    benchmarkTicker,
    setBenchmarkTicker,
    leverage,
    setLeverage,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isLoading,
    error,
    results,
    runAnalysis,
  } = useLETFSlippageState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">LETF 滑点分析</h1>
      </div>
      <LETFSlippagePresets />
      <ToolPageLayout
        title="LETF 参数"
        params={
          <LETFParamsPanel
            letfTicker={letfTicker}
            benchmarkTicker={benchmarkTicker}
            leverage={leverage}
            startDate={startDate}
            endDate={endDate}
            isLoading={isLoading}
            onLetfTickerChange={setLetfTicker}
            onBenchmarkTickerChange={setBenchmarkTicker}
            onLeverageChange={setLeverage}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onRun={runAnalysis}
          />
        }
        results={
          <LETFResultsPanel
            results={results}
            error={error}
            isLoading={isLoading}
            leverage={leverage}
          />
        }
      />
    </div>
  );
}
