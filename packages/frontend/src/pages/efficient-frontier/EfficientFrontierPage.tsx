/* eslint-disable @typescript-eslint/no-explicit-any */
import { useTranslation } from 'react-i18next';
import { FrontierParams } from './EfficientFrontierParams.js';
import { FrontierResults } from './EfficientFrontierResults.js';
import { useEfficientFrontierState } from './EfficientFrontierUtils.js';
import { ComputeToolShell } from '../../components/shells/ComputeToolShell.js';
import type { ComputeToolConfig } from '../../components/shells/types.js';

function FrontierParamsWrapper({ state }: { state: any }) {
  return (
    <FrontierParams
      tickers={state.tickers}
      startDate={state.startDate}
      endDate={state.endDate}
      numPoints={state.numPoints}
      solveSpeed={state.solveSpeed}
      minInclusionWeight={state.minInclusionWeight}
      rebalanceFrequency={state.rebalanceFrequency}
      allowCash={state.allowCash}
      returnObjective={state.returnObjective}
      solver={state.solver}
      onAddTicker={state.addTicker}
      onRemoveTicker={state.removeTicker}
      onUpdateTicker={state.updateTicker}
      onStartDateChange={state.setStartDate}
      onEndDateChange={state.setEndDate}
      onNumPointsChange={state.setNumPoints}
      onSolveSpeedChange={state.setSolveSpeed}
      onMinInclusionWeightChange={state.setMinInclusionWeight}
      onRebalanceFrequencyChange={state.setRebalanceFrequency}
      onAllowCashChange={state.setAllowCash}
      onReturnObjectiveChange={state.setReturnObjective}
      onSolverChange={state.setSolver}
      isLoading={state.isLoading}
      onRun={state.runFrontier}
    />
  );
}

function FrontierResultsWrapper({ state }: { state: any }) {
  const { t } = useTranslation();
  return (
    <>
      {state.error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
        >
          {t('efficientFrontier.calcFailed')}: {state.error}
        </div>
      )}
      {state.correlationError && !state.error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--warning, #f59e0b)', textAlign: 'center', padding: 16 }}
        >
          {state.correlationError}
        </div>
      )}
      {state.results && state.results.frontier.length > 0 && (
        <FrontierResults
          results={state.results}
          scatterData={state.scatterData}
          sharpeRange={state.sharpeRange}
          maxSharpe={state.maxSharpe}
          allocationData={state.allocationData}
          allAssetTickers={state.allAssetTickers}
          correlations={state.correlations}
          correlationError={state.correlationError}
          selectedPoint={state.selectedPoint}
          rebalanceFrequency={state.rebalanceFrequency}
          allowCash={state.allowCash}
          returnObjective={state.returnObjective}
          solver={state.solver}
          onSelectPoint={state.setSelectedPoint}
          onLoadInBacktester={state.handleLoadInBacktester}
        />
      )}
    </>
  );
}

const config: ComputeToolConfig<any> = {
  titleKey: 'efficientFrontier.title',
  seoDescKey: 'efficientFrontier.seo.desc',
  seoFeatures: [
    {
      titleKey: 'efficientFrontier.seo.visualizationTitle',
      descKey: 'efficientFrontier.seo.visualizationDesc',
    },
    {
      titleKey: 'efficientFrontier.seo.constraintsTitle',
      descKey: 'efficientFrontier.seo.constraintsDesc',
    },
  ],
  relatedTools: [
    { titleKey: 'nav.portfolioBacktest', href: '/' },
    { titleKey: 'nav.portfolioOptimize', href: '/optimizer' },
    { titleKey: 'nav.assetAnalysis', href: '/analysis' },
  ],
  params: FrontierParamsWrapper,
  results: FrontierResultsWrapper,
};

export default function EfficientFrontierPage() {
  const s = useEfficientFrontierState();
  return <ComputeToolShell config={config} state={s} />;
}
