import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/uiComponents';
import { TableEmpty } from '@/components/stateDisplay.js';
import {
  AXIS_TICK_STYLE,
  CHART_GRID_PROPS,
  CHART_TOOLTIP_STYLE,
  getPortfolioColor,
} from '@/lib/chart-theme.js';
import { useReducedMotion } from '@/hooks/miscHooks.js';

export function NoDataCard() {
  const { t } = useTranslation();
  return (
    <Card className="p-5">
      <TableEmpty message={t('No data')} className="text-caption" />
    </Card>
  );
}

export function HistogramChart({
  data,
  height = 350,
  tooltipFormatter,
  disableTooltipAnimation = false,
  referenceLines,
}: {
  data: { range: string; count: number }[];
  height?: number;
  tooltipFormatter?: (value: number, name: string) => [string, string] | string;
  disableTooltipAnimation?: boolean;
  referenceLines?: { label: string; color: string; value: string }[];
}) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid {...CHART_GRID_PROPS} />
        <XAxis dataKey="range" tick={AXIS_TICK_STYLE} interval={3} />
        <YAxis tick={AXIS_TICK_STYLE} />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          isAnimationActive={!disableTooltipAnimation && !reducedMotion}
          formatter={tooltipFormatter}
        />
        <Bar
          dataKey="count"
          fill={getPortfolioColor(0)}
          fillOpacity={0.7}
          name={t('Frequency')}
          radius={[2, 2, 0, 0]}
        />
        {referenceLines?.map((rl) => (
          <ReferenceLine
            key={rl.label}
            x={rl.label}
            stroke={rl.color}
            strokeDasharray="4 2"
            label={{
              value: rl.value,
              position: 'top',
              fontSize: 11,
              fill: rl.color,
            }}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
