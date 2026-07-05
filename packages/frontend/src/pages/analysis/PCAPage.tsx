import { usePCAState } from '../hooks/usePCAState.js';
import PCAParamsPanel from '../components/pca/PCAParams.js';
import PCAResultsPanel from '../components/pca/PCAResults.js';
import PCASeoCard from '../components/pca/PCAPresets.js';
import { ToolPageLayout } from '../components/layout/ToolPageLayout.js';

export default function PCAPage() {
  const s = usePCAState();
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">主成分分析（PCA）</h1>
      </div>
      <PCASeoCard />
      <ToolPageLayout
        title="PCA 参数"
        params={
          <PCAParamsPanel
            tickers={s.tickers}
            startDate={s.startDate}
            endDate={s.endDate}
            numComponents={s.numComponents}
            isLoading={s.isLoading}
            onAddTicker={s.addTicker}
            onRemoveTicker={s.removeTicker}
            onUpdateTicker={s.updateTicker}
            onStartDateChange={s.setStartDate}
            onEndDateChange={s.setEndDate}
            onNumComponentsChange={s.setNumComponents}
            onRun={s.runAnalysis}
          />
        }
        results={<PCAResultsPanel results={s.results} error={s.error} isLoading={s.isLoading} />}
      />
    </div>
  );
}
