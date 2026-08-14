import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { getCorrelationColor } from '@/lib/chart-theme.js';
import { getCorrelationTextColor } from './chartUtils.js';
import ChartCard from '../ChartCard.js';
interface MatrixHeatmapProps {
  rowLabels: string[];
  columnLabels: string[];
  matrix: number[][];
  getBackgroundColor: (value: number) => string;
  getTextColor: (value: number) => string;
  formatValue: (value: number) => string;
  formatTitle?: (value: number, rowLabel: string, colLabel: string) => string;
  minCellWidth?: number;
  minCellHeight?: number;
  baseCellWidth?: number;
  baseCellHeight?: number;
}
export function MatrixHeatmap({
  rowLabels,
  columnLabels,
  matrix,
  getBackgroundColor,
  getTextColor,
  formatValue,
  formatTitle,
  minCellWidth = 48,
  minCellHeight = 36,
  baseCellWidth = 600,
  baseCellHeight = 400,
}: MatrixHeatmapProps) {
  const cellWidth = Math.max(minCellWidth, baseCellWidth / columnLabels.length);
  const cellHeight = Math.max(minCellHeight, baseCellHeight / rowLabels.length);
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th
              className="px-3 py-2 text-label-tiny font-medium"
              style={{ color: 'var(--text-muted)' }}
            />
            {columnLabels.map((col) => (
              <th
                key={col}
                scope="col"
                className="px-3 py-2 text-label-tiny font-medium text-center"
                style={{ color: 'var(--text-muted)' }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((rowLabel, i) => (
            <tr key={rowLabel}>
              <td
                className="px-3 py-2 text-caption font-medium"
                style={{ color: 'var(--text-body)' }}
              >
                {rowLabel}
              </td>
              {columnLabels.map((colLabel, j) => {
                const value = matrix[i]?.[j] ?? 0;
                const titleText = formatTitle
                  ? formatTitle(value, rowLabel, colLabel)
                  : `${rowLabel} vs ${colLabel}: ${value.toFixed(2)}`;
                return (
                  <td
                    key={colLabel}
                    className="text-caption text-center cursor-default"
                    style={{
                      backgroundColor: getBackgroundColor(value),
                      color: getTextColor(value),
                      width: `${cellWidth}px`,
                      height: `${cellHeight}px`,
                    }}
                    title={titleText}
                  >
                    {formatValue(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const BETA_COLORS = {
  high: 'hsl(var(--corr-neg-2))',
  medium: 'hsl(var(--corr-neg-3))',
  low: 'hsl(var(--corr-pos-3))',
  neutral: 'hsl(var(--surface))',
} as const;
function getBetaColor(val: number): string {
  const absVal = Math.abs(val);
  if (absVal > 1.5) return BETA_COLORS.high;
  if (absVal > 1) return BETA_COLORS.medium;
  if (absVal > 0.5) return BETA_COLORS.low;
  return BETA_COLORS.neutral;
}
export const BetaMatrixTable = memo(function BetaMatrixTable({
  tickers,
  betaMatrix,
}: {
  tickers: string[];
  betaMatrix: number[][];
}) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('Beta Matrix')}>
      <MatrixHeatmap
        rowLabels={tickers}
        columnLabels={tickers}
        matrix={betaMatrix}
        getBackgroundColor={getBetaColor}
        getTextColor={(val) => getCorrelationTextColor(val / 2)}
        formatValue={(v) => v.toFixed(2)}
        formatTitle={(v, r, c) => `${r} vs ${c}: Beta = ${v.toFixed(2)}`}
      />
    </ChartCard>
  );
});
export const CorrelationMatrixTable = memo(function CorrelationMatrixTable({
  tickers,
  correlations,
  title,
}: {
  tickers: string[] | Array<{ ticker: string }>;
  correlations: number[][];
  title?: string;
}) {
  const { t } = useTranslation();
  const labels = tickers.map((tk) => (typeof tk === 'string' ? tk : tk.ticker));
  return (
    <ChartCard title={title ?? t('Correlation Matrix')}>
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
