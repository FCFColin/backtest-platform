import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TRADING_DAYS_PER_YEAR } from '@backtest/shared/constants';
import type { AssetAnalysisResult } from '@backtest/shared';
import { computeBetaMatrix, computeRollingCorrelation } from './utils.js';
import {
  GrowthChart,
  DrawdownChart,
  CorrelationMatrixTable,
  StatsTable,
  BetaMatrixTable,
  RollingCorrelationChart,
  SeoCard,
} from './charts/ChartComponents.js';
import {
  OverviewCharts,
  TelltaleChart,
  RollingMetricsChart,
  RiskReturnChart,
  AnnualReturnsChart,
  MonthlyHeatmap,
} from './charts/ChartComposites.js';

export {
  GrowthChart,
  DrawdownChart,
  CorrelationMatrixTable,
  StatsTable,
  BetaMatrixTable,
  RollingCorrelationChart,
  SeoCard,
};
export {
  OverviewCharts,
  TelltaleChart,
  RollingMetricsChart,
  RiskReturnChart,
  AnnualReturnsChart,
  MonthlyHeatmap,
};

const TABS = [
  { key: 'summary', labelKey: 'tabs.summary' },
  { key: 'telltale', labelKey: 'tabs.telltale' },
  { key: 'correlations', labelKey: 'tabs.correlationsBeta' },
  { key: 'rolling', labelKey: 'tabs.rollingMetrics' },
  { key: 'risk-return', labelKey: 'tabs.riskVsReturn' },
  { key: 'returns', labelKey: 'tabs.returns' },
];

const TAB_COMPONENTS: Record<
  string,
  React.ComponentType<{
    results: AssetAnalysisResult;
    correlationWindow?: number;
    rollingWindow?: number;
  }>
> = {
  summary: OverviewCharts,
  telltale: TelltaleChart,
  correlations: CorrelationsBetaTab,
  rolling: RollingMetricsChart,
  'risk-return': RiskReturnChart,
  returns: ReturnsTab,
};

export function CorrelationsBetaTab({
  results,
  correlationWindow = 12,
}: {
  results: AssetAnalysisResult;
  correlationWindow?: number;
}) {
  const [rollingPair, setRollingPair] = useState<[number, number]>([
    0,
    Math.min(1, results.tickers.length - 1),
  ]);
  const tickers = results.tickers.map((t) => t.ticker);
  const betaMatrix = useMemo(
    () => computeBetaMatrix(results.tickers.map((t) => t.dailyReturns)),
    [results],
  );
  const rollingCorrData = useMemo(() => {
    if (results.tickers.length < 2) return [];
    const dates = results.tickers[0].growthCurve.map((g) => g.date).slice(1);
    const windowDays = Math.round((correlationWindow * TRADING_DAYS_PER_YEAR) / 12);
    return computeRollingCorrelation(
      results.tickers[rollingPair[0]]?.dailyReturns ?? [],
      results.tickers[rollingPair[1]]?.dailyReturns ?? [],
      dates,
      windowDays,
    );
  }, [results, rollingPair, correlationWindow]);

  return (
    <div className="space-y-6">
      <CorrelationMatrixTable tickers={results.tickers} correlations={results.correlations} />
      <BetaMatrixTable tickers={tickers} betaMatrix={betaMatrix} />
      {results.tickers.length >= 2 && (
        <RollingCorrelationChart
          tickers={tickers}
          rollingPair={rollingPair}
          setRollingPair={setRollingPair}
          rollingCorrData={rollingCorrData}
        />
      )}
    </div>
  );
}

export function ReturnsTab({ results }: { results: AssetAnalysisResult }) {
  return (
    <div className="space-y-6">
      <AnnualReturnsChart results={results} />
      <MonthlyHeatmap results={results} />
    </div>
  );
}

export function AnalysisResultsPanel({
  error,
  results,
  activeTab,
  setActiveTab,
  isLoading,
  correlationWindow,
  rollingWindow,
}: {
  error: string | null;
  results: AssetAnalysisResult | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isLoading: boolean;
  correlationWindow: number;
  rollingWindow: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
          {t('analysis.analysisFailed')}：{error}
        </div>
      )}
      {results && (
        <div className="card">
          <div className="result-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
              >
                {t(tab.labelKey)}
              </button>
            ))}
          </div>
          <div className="result-content">
            {(() => {
              const TabComponent = TAB_COMPONENTS[activeTab];
              return TabComponent ? (
                <TabComponent
                  results={results}
                  correlationWindow={correlationWindow}
                  rollingWindow={rollingWindow}
                />
              ) : null;
            })()}
          </div>
        </div>
      )}
      {!results && !error && !isLoading && (
        <div
          className="card"
          style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
        >
          {t('analysis.noResultsHint')}
        </div>
      )}
    </div>
  );
}
