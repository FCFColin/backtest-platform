import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { MatrixHeatmap } from './MatrixHeatmap.js';
import ChartCard from '../ChartCard.js';
const BETA_COLORS = {
  high: '#f0c8c8',
  medium: '#f5e0d0',
  low: '#d8e8f0',
  neutral: 'var(--bg-subtle)'
} as const;
function getBetaColor(val: number): string {
  const absVal = Math.abs(val);
  if (absVal > 1.5) return BETA_COLORS.high;
  if (absVal > 1) return BETA_COLORS.medium;
  if (absVal > 0.5) return BETA_COLORS.low;
  return BETA_COLORS.neutral;
}
function getBetaTextColor(): string {
  return 'var(--text-body)';
}
export const BetaMatrixTable = memo(function BetaMatrixTable({ tickers, betaMatrix }: { tickers: string[]; betaMatrix: number[][] }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('analysis.betaMatrix')}>
      <MatrixHeatmap rowLabels={tickers} columnLabels={tickers} matrix={betaMatrix} getBackgroundColor={getBetaColor} getTextColor={getBetaTextColor} formatValue={(v) => v.toFixed(2)} formatTitle={(v, r, c) => `${r} vs ${c}: Beta = ${v.toFixed(2)}`} />
    </ChartCard>
  );
});
