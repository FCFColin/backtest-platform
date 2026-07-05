import { Play } from 'lucide-react';
import LoadingButton from '../components/LoadingButton';
import { useFactorRegressionState } from '../hooks/useFactorRegressionState';
import FactorParamsSection, {
  PortfolioEditor,
} from '../components/factorRegression/FactorRegressionParams';
import FactorRegressionSeoCard from '../components/factorRegression/FactorRegressionPresets';
import RegressionResultTable from '../components/factorRegression/FactorRegressionResults';

export default function FactorRegressionPage() {
  const {
    startDate,
    endDate,
    returnFrequency,
    rfSource,
    selectedFactors,
    assets,
    totalWeight,
    isLoading,
    error,
    result,
    runRegression,
    setStartDate,
    setEndDate,
    setReturnFrequency,
    setRfSource,
    toggleFactor,
    addAsset,
    removeAsset,
    updateAsset,
  } = useFactorRegressionState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">因子回归分析</h1>
      </div>
      <FactorRegressionSeoCard />

      <div className="bt-main-card card">
        <FactorParamsSection
          startDate={startDate}
          endDate={endDate}
          returnFrequency={returnFrequency}
          rfSource={rfSource}
          selectedFactors={selectedFactors}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onReturnFrequencyChange={setReturnFrequency}
          onRfSourceChange={setRfSource}
          onToggleFactor={toggleFactor}
        />
        <PortfolioEditor
          assets={assets}
          totalWeight={totalWeight}
          onAdd={addAsset}
          onRemove={removeAsset}
          onUpdate={updateAsset}
        />
        <div className="bt-action-row">
          <LoadingButton
            isLoading={isLoading}
            onClick={runRegression}
            loadingText="回归分析中..."
            style={{ width: '100%' }}
          >
            <Play className="w-4 h-4" />
            开始分析
          </LoadingButton>
        </div>
      </div>

      {error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
        >
          分析失败：{error}
        </div>
      )}
      {result && <RegressionResultTable result={result} selectedFactors={selectedFactors} />}
    </div>
  );
}
