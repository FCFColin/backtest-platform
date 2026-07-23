import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getCorrelationColor } from './chartConstants.js';
import { getCorrelationTextColor } from './correlationDataTransforms.js';
import { MatrixHeatmap } from './MatrixHeatmap.js';
import ChartCard from '../ChartCard.js';

export const CorrelationMatrixTable = memo(function CorrelationMatrixTable({
  tickers,
  correlations,
}: {
  tickers: Array<{ ticker: string }>;
  correlations: number[][];
}) {
  const { t } = useTranslation();
  const labels = tickers.map((tk) => tk.ticker);
  return (
    <ChartCard title={t('analysis.correlationMatrix')}>
      <MatrixHeatmap
        rowLabels={labels}
        columnLabels={labels}
        matrix={correlations}
        getBackgroundColor={getCorrelationColor}
        getTextColor={getCorrelationTextColor}
        formatValue={(v) => v.toFixed(2)}
      />
    </ChartCard>
  );
});
