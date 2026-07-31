import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card } from '@/components/ui/uiComponents';
import { CHART_COLORS } from '@backtest/shared';
import type { MonteCarloResult } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE, CHART_GRID_PROPS, AXIS_TICK_STYLE } from '@/lib/chart-theme.js';
import { buildScenarioData, monthFormatter, dollarKFormatter, dollarFormatter, yearLabelFormatter } from './monteCarloUtils.js';
function ScenarioLines({ isAnimationActive = true }: { isAnimationActive?: boolean }) {
  return (
    <>
      <Line type="monotone" dataKey="best" stroke={CHART_COLORS[2]} strokeWidth={2} dot={false} name="Best" isAnimationActive={isAnimationActive} />
      <Line type="monotone" dataKey="p75" stroke={CHART_COLORS[0]} strokeWidth={1.5} dot={false} name="P75" isAnimationActive={isAnimationActive} />
      <Line type="monotone" dataKey="median" stroke={CHART_COLORS[4]} strokeWidth={2.5} dot={false} name="Median" isAnimationActive={isAnimationActive} />
      <Line type="monotone" dataKey="p25" stroke={CHART_COLORS[1]} strokeWidth={1.5} dot={false} name="P25" isAnimationActive={isAnimationActive} />
      <Line type="monotone" dataKey="worst" stroke={CHART_COLORS[3]} strokeWidth={2} dot={false} name="Worst" isAnimationActive={isAnimationActive} />
    </>
  );
}
export function MonteCarloScenariosTab({ r, startingValue }: { r: MonteCarloResult; startingValue: number }) {
  const { t } = useTranslation();
  const { data } = buildScenarioData(r, startingValue);
  if (data.length === 0) {
    return (
      <Card className="p-5">
        <div className="py-6 text-center text-caption text-fg-tertiary">{t('monteCarlo.results.noData')}</div>
      </Card>
    );
  }
  const isLargeDataset = data.length >= 100;
  return (
    <Card className="p-5">
      <ResponsiveContainer width="100%" height={450}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
          <XAxis dataKey="month" tick={AXIS_TICK_STYLE} tickFormatter={monthFormatter} interval={11} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={dollarKFormatter} />
          <Tooltip formatter={dollarFormatter} labelFormatter={(l: number) => yearLabelFormatter(t, l)} contentStyle={CHART_TOOLTIP_STYLE} isAnimationActive={!isLargeDataset} animationDuration={isLargeDataset ? 0 : 150} />
          <Legend wrapperStyle={{ fontSize: 12, color: 'hsl(var(--fg-tertiary))' }} />
          <ScenarioLines isAnimationActive={!isLargeDataset} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
