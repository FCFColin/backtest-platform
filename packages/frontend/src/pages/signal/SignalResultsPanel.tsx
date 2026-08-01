import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import {
  CHART_TOOLTIP_STYLE,
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
} from '@/lib/chart-theme';
import { ErrorBanner } from '@/components/stateDisplay';
import { EmptyState } from '@/components/stateDisplay';
interface EmptyResultsHintProps {
  text?: string;
}
export function EmptyResultsHint({ text }: EmptyResultsHintProps) {
  const { t } = useTranslation();
  return <EmptyState title={text ?? t('signal.common.emptyHint')} />;
}
interface AnalysisErrorAlertProps {
  error: string | null;
  prefix?: string;
}
export function AnalysisErrorAlert({ error, prefix }: AnalysisErrorAlertProps) {
  const { t } = useTranslation();
  if (!error) return null;
  const message = `${prefix ?? t('signal.common.analysisFailedPrefix')}${error}`;
  return <ErrorBanner message={message} />;
}
interface ResultsContainerProps {
  children: ReactNode;
}
export function ResultsContainer({ children }: ResultsContainerProps) {
  return <div className="flex flex-col gap-4">{children}</div>;
}
interface EquitySeriesConfig {
  dataKey: string;
  legendName?: string;
  strokeWidth?: number;
}
interface EquityLineChartProps {
  data: Array<Record<string, number | string>>;
  series: EquitySeriesConfig[] | string[];
  tooltipName?: string;
  tooltipLabelPrefix?: string;
  referenceY?: number;
  height?: number;
  defaultStrokeWidth?: number;
}
function normalizeSeries(
  series: EquitySeriesConfig[] | string[],
  defaultStrokeWidth: number,
): Required<EquitySeriesConfig>[] {
  return series.map((s) => {
    const cfg = typeof s === 'string' ? { dataKey: s } : s;
    return {
      dataKey: cfg.dataKey,
      legendName: cfg.legendName ?? cfg.dataKey,
      strokeWidth: cfg.strokeWidth ?? defaultStrokeWidth,
    };
  });
}
export function EquityLineChart({
  data,
  series,
  tooltipName,
  tooltipLabelPrefix,
  referenceY = 10000,
  height = 350,
  defaultStrokeWidth = 2,
}: EquityLineChartProps) {
  const { t } = useTranslation();
  const resolvedTooltipName = tooltipName ?? t('signal.common.equity');
  const normalized = normalizeSeries(series, defaultStrokeWidth);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
        <YAxis
          tick={AXIS_TICK_STYLE}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label: string) =>
            tooltipLabelPrefix !== undefined
              ? `${tooltipLabelPrefix}${label}`
              : t('signal.common.dateLabel', { date: label })
          }
          formatter={(value: number) => [`$${value.toLocaleString()}`, resolvedTooltipName]}
        />
        <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
        {referenceY !== undefined && (
          <ReferenceLine y={referenceY} stroke="var(--fg-tertiary)" strokeDasharray="4 4" />
        )}
        {normalized.map((s, idx) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.legendName}
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            strokeWidth={s.strokeWidth}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
