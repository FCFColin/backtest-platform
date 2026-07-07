import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult } from '@backtest/shared';
import { useAnalysisData } from '../../hooks/useAnalysisData.js';
import { GrowthChart } from './AnalysisGrowthChart.js';
import { DrawdownChart } from './AnalysisDrawdownChart.js';
import { CorrelationMatrixTable } from './CorrelationMatrixTable.js';

export const OverviewCharts = memo(function OverviewCharts({
  results,
  StatsTable,
}: {
  results: AssetAnalysisResult;
  StatsTable: React.ComponentType<{ tickers: AssetAnalysisResult['tickers'] }>;
}) {
  const { t } = useTranslation();
  const { tickers, portfolioResults, growthData, drawdownData } = useAnalysisData(results, 12, 12);

  return (
    <div className="space-y-6">
      <div className="chart-card">
        <div className="chart-card-title">{t('analysis.statsOverview')}</div>
        <StatsTable tickers={tickers} />
      </div>
      <GrowthChart growthData={growthData} portfolioResults={portfolioResults} />
      <DrawdownChart drawdownData={drawdownData} portfolioResults={portfolioResults} />
      {results.correlations && results.correlations.length >= 2 && (
        <CorrelationMatrixTable tickers={tickers} correlations={results.correlations} />
      )}
    </div>
  );
});
