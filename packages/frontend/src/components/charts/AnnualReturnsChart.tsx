import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult } from '@backtest/shared';
import { useAnalysisData } from '../../hooks/useAnalysisData.js';
import { BarChartContent } from './sharedChartContent.js';

export const AnnualReturnsChart = memo(function AnnualReturnsChart({
  results,
}: {
  results: AssetAnalysisResult;
}) {
  const { t } = useTranslation();
  const { annualData } = useAnalysisData(results, 12, 12);
  return (
    <div className="chart-card">
      <div className="chart-card-title">{t('analysis.annualReturns')}</div>
      <BarChartContent
        data={annualData}
        seriesNames={results.tickers.map((tk) => tk.ticker)}
        xDataKey="year"
        height={350}
        yTickFormatter={(v) => `${v.toFixed(0)}%`}
        tooltipValueFormatter={(v) => [`${v.toFixed(2)}%`, '']}
        barRadius={2}
      />
    </div>
  );
});
