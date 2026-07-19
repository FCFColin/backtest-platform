import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ToolSeoCard } from '../../components/layout/index.js';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { FrontierParams } from './EfficientFrontierParams.js';
import { FrontierResults } from './EfficientFrontierResults.js';
import { useEfficientFrontierState } from './EfficientFrontierUtils.js';

type FrontierState = ReturnType<typeof useEfficientFrontierState>;

/** 结果区：错误 / 相关性错误 / 主结果容器，抽出以避免触发 max-lines-per-function 规则 */
function FrontierResultsSection({ s, t }: { s: FrontierState; t: TFunction }) {
  return (
    <>
      {s.error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
        >
          {t('efficientFrontier.calcFailed')}: {s.error}
        </div>
      )}
      {s.correlationError && !s.error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--warning, #f59e0b)', textAlign: 'center', padding: 16 }}
        >
          {s.correlationError}
        </div>
      )}
      {s.results && s.results.frontier.length > 0 && (
        <FrontierResults
          results={s.results}
          scatterData={s.scatterData}
          sharpeRange={s.sharpeRange}
          maxSharpe={s.maxSharpe}
          allocationData={s.allocationData}
          allAssetTickers={s.allAssetTickers}
          correlations={s.correlations}
          correlationError={s.correlationError}
          selectedPoint={s.selectedPoint}
          rebalanceFrequency={s.rebalanceFrequency}
          allowCash={s.allowCash}
          returnObjective={s.returnObjective}
          solver={s.solver}
          onSelectPoint={s.setSelectedPoint}
          onLoadInBacktester={s.handleLoadInBacktester}
        />
      )}
    </>
  );
}

export default function EfficientFrontierPage() {
  const { t } = useTranslation();
  const s = useEfficientFrontierState();

  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('efficientFrontier.title')}</h1>
      </div>
      <ToolSeoCard
        desc={t('efficientFrontier.seo.desc')}
        features={[
          {
            title: t('efficientFrontier.seo.visualizationTitle'),
            desc: t('efficientFrontier.seo.visualizationDesc'),
          },
          {
            title: t('efficientFrontier.seo.constraintsTitle'),
            desc: t('efficientFrontier.seo.constraintsDesc'),
          },
        ]}
        related={[
          { title: t('nav.portfolioBacktest'), href: '/' },
          { title: t('nav.portfolioOptimize'), href: '/optimizer' },
          { title: t('nav.assetAnalysis'), href: '/analysis' },
          { title: t('nav.monteCarlo'), href: '/monte-carlo' },
        ]}
      />
      <ToolPageLayout
        title={t('efficientFrontier.params.title')}
        params={
          <FrontierParams
            tickers={s.tickers}
            startDate={s.startDate}
            endDate={s.endDate}
            numPoints={s.numPoints}
            solveSpeed={s.solveSpeed}
            minInclusionWeight={s.minInclusionWeight}
            rebalanceFrequency={s.rebalanceFrequency}
            allowCash={s.allowCash}
            returnObjective={s.returnObjective}
            solver={s.solver}
            onAddTicker={s.addTicker}
            onRemoveTicker={s.removeTicker}
            onUpdateTicker={s.updateTicker}
            onStartDateChange={s.setStartDate}
            onEndDateChange={s.setEndDate}
            onNumPointsChange={s.setNumPoints}
            onSolveSpeedChange={s.setSolveSpeed}
            onMinInclusionWeightChange={s.setMinInclusionWeight}
            onRebalanceFrequencyChange={s.setRebalanceFrequency}
            onAllowCashChange={s.setAllowCash}
            onReturnObjectiveChange={s.setReturnObjective}
            onSolverChange={s.setSolver}
            isLoading={s.isLoading}
            onRun={s.runFrontier}
          />
        }
        results={<FrontierResultsSection s={s} t={t} />}
      />
    </div>
  );
}
