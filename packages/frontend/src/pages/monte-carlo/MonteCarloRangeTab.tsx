import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/uiComponents';
import { CHART_COLORS, type MonteCarloResult } from '@backtest/shared';
import { CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from '@/lib/chart-theme.js';
import { fmtDollar } from '@/utils/format';
import { useChartAnimation } from '@/hooks/miscHooks';
import { HistogramChart, NoDataCard } from './HistogramChart.js';
import {
  buildFanChartData,
  buildSuccessData,
  buildTerminalHistogram,
  fanAreas,
  fanMedianLine,
  type FanDataPoint,
} from './monteCarloUtils.js';
import SvgFanChart from './SvgFanChart.js';
const TICK_STYLE = { fill: 'hsl(var(--fg-tertiary))', fontSize: 12 } as const;
function FanChart({ data }: { data: FanDataPoint[] }) {
  const { t } = useTranslation();
  const areas = fanAreas(t);
  const median = fanMedianLine(t);
  return (
    <SvgFanChart
      data={data}
      band5_95Name={areas[0]?.name ?? ''}
      band25_75Name={areas[1]?.name ?? ''}
      medianName={median.name}
    />
  );
}
function MonteCarloTerminalHistogram({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const { data, p5Val, p50Val, p95Val, p5Label, p50Label, p95Label } = buildTerminalHistogram(
    r,
    startingValue,
  );
  if (data.length === 0) return null;
  return (
    <Card className="p-5">
      <h4 className="mb-3 text-heading text-fg-secondary tabular-nums">
        {t('Terminal Value Distribution')}
      </h4>
      <HistogramChart
        data={data}
        height={300}
        disableTooltipAnimation
        tooltipFormatter={(value: number) => [String(value), t('Frequency')]}
        referenceLines={[
          {
            label: p5Label,
            color: CHART_COLORS[3],
            value: t('charts.annualReturn.p5', { value: fmtDollar(p5Val) }),
          },
          {
            label: p50Label,
            color: CHART_COLORS[2],
            value: t('Median', { value: fmtDollar(p50Val) }),
          },
          {
            label: p95Label,
            color: CHART_COLORS[4],
            value: t('charts.annualReturn.p95', { value: fmtDollar(p95Val) }),
          },
        ]}
      />
    </Card>
  );
}
export function MonteCarloSuccessTab({ r }: { r: MonteCarloResult }) {
  const { t } = useTranslation();
  const data = buildSuccessData(r);
  const seriesAnimationActive = useChartAnimation(data.length >= 100);
  if (data.length === 0) return <NoDataCard />;
  const successLines = [
    { key: 'survival', color: CHART_COLORS[2], nameKey: 'monteCarlo.results.survivalProb' },
    {
      key: 'capitalPreservation',
      color: CHART_COLORS[0],
      nameKey: 'Capital Preservation',
    },
    { key: 'profit', color: CHART_COLORS[1], nameKey: 'monteCarlo.results.profitProb' },
  ];
  return (
    <Card className="p-5">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
          <XAxis
            dataKey="year"
            tick={TICK_STYLE}
            label={{
              value: t('Years'),
              position: 'insideBottom',
              offset: -5,
              fontSize: 12,
              fill: 'hsl(var(--fg-tertiary))',
            }}
          />
          <YAxis tick={TICK_STYLE} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
          <Tooltip
            formatter={(v: number) => `${v}%`}
            contentStyle={CHART_TOOLTIP_STYLE}
            isAnimationActive={seriesAnimationActive}
            animationDuration={seriesAnimationActive ? 150 : 0}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: 'hsl(var(--fg-tertiary))' }} />
          {successLines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={2}
              dot={false}
              name={t(l.nameKey)}
              isAnimationActive={seriesAnimationActive}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
export function MonteCarloRangeTab({
  r,
  startingValue,
}: {
  r: MonteCarloResult;
  startingValue: number;
}) {
  const { t } = useTranslation();
  const data = buildFanChartData(r, startingValue);
  if (data.length === 0) return <NoDataCard />;
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h4 className="mb-3 text-sm font-semibold tabular-nums text-fg-secondary">
          {t('Monte Carlo Fan Chart')}
        </h4>
        <FanChart data={data} />
      </Card>
      <MonteCarloTerminalHistogram r={r} startingValue={startingValue} />
    </div>
  );
}
