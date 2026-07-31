import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card } from '@/components/ui/uiComponents';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS, AXIS_TICK_STYLE } from '@/lib/chart-theme.js';
import { fmtDollar } from '@/utils/format';
import { buildTerminalHistogram } from './monteCarloUtils.js';
export function MonteCarloTerminalHistogram({ r, startingValue }: { r: MonteCarloResult; startingValue: number }) {
  const { t } = useTranslation();
  const { data, p5Val, p50Val, p95Val, p5Label, p50Label, p95Label } = buildTerminalHistogram(r, startingValue);
  if (data.length === 0) return null;
  return (
    <Card className="p-5">
      <h4 className="mb-3 text-heading text-fg-secondary tabular-nums">{t('monteCarlo.histogram.title')}</h4>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
          <XAxis dataKey="range" tick={{ fill: 'hsl(var(--fg-tertiary))', fontSize: 10 }} interval={3} />
          <YAxis tick={AXIS_TICK_STYLE} />
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} isAnimationActive={false} formatter={(value: number) => [String(value), t('monteCarlo.histogram.frequency')]} />
          <Bar dataKey="count" fill={CHART_COLORS[0]} fillOpacity={0.7} name={t('monteCarlo.histogram.frequency')} radius={[2, 2, 0, 0]} />
          <ReferenceLine
            x={p5Label}
            stroke={CHART_COLORS[3]}
            strokeDasharray="4 2"
            label={{
              value: t('monteCarlo.histogram.p5', { value: fmtDollar(p5Val) }),
              position: 'top',
              fontSize: 11,
              fill: CHART_COLORS[3]
            }}
          />
          <ReferenceLine
            x={p50Label}
            stroke={CHART_COLORS[2]}
            strokeDasharray="4 2"
            label={{
              value: t('monteCarlo.histogram.median', { value: fmtDollar(p50Val) }),
              position: 'top',
              fontSize: 11,
              fill: CHART_COLORS[2]
            }}
          />
          <ReferenceLine
            x={p95Label}
            stroke={CHART_COLORS[4]}
            strokeDasharray="4 2"
            label={{
              value: t('monteCarlo.histogram.p95', { value: fmtDollar(p95Val) }),
              position: 'top',
              fontSize: 11,
              fill: CHART_COLORS[4]
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
