import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/uiComponents';
import { CHART_COLORS, type MonteCarloResult } from '@backtest/shared';
import { AXIS_TICK_STYLE, CHART_GRID_PROPS, CHART_TOOLTIP_STYLE } from '@/lib/chart-theme.js';
import { fmtDollar } from '@/utils/format';
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
export function MonteCarloTerminalHistogram({
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
        {t('monteCarlo.histogram.title')}
      </h4>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="hsl(var(--border-subtle))" />
          <XAxis
            dataKey="range"
            tick={{ fill: 'hsl(var(--fg-tertiary))', fontSize: 10 }}
            interval={3}
          />
          <YAxis tick={AXIS_TICK_STYLE} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            isAnimationActive={false}
            formatter={(value: number) => [String(value), t('monteCarlo.histogram.frequency')]}
          />
          <Bar
            dataKey="count"
            fill={CHART_COLORS[0]}
            fillOpacity={0.7}
            name={t('monteCarlo.histogram.frequency')}
            radius={[2, 2, 0, 0]}
          />
          {[
            {
              label: p5Label,
              color: CHART_COLORS[3],
              val: fmtDollar(p5Val),
              key: 'monteCarlo.histogram.p5',
            },
            {
              label: p50Label,
              color: CHART_COLORS[2],
              val: fmtDollar(p50Val),
              key: 'monteCarlo.histogram.median',
            },
            {
              label: p95Label,
              color: CHART_COLORS[4],
              val: fmtDollar(p95Val),
              key: 'monteCarlo.histogram.p95',
            },
          ].map((rl) => (
            <ReferenceLine
              key={rl.label}
              x={rl.label}
              stroke={rl.color}
              strokeDasharray="4 2"
              label={{
                value: t(rl.key, { value: rl.val }),
                position: 'top',
                fontSize: 11,
                fill: rl.color,
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
export function MonteCarloSuccessTab({ r }: { r: MonteCarloResult }) {
  const { t } = useTranslation();
  const data = buildSuccessData(r);
  if (data.length === 0) {
    return (
      <Card className="p-5">
        <div className="py-6 text-center text-caption text-fg-tertiary">
          {t('monteCarlo.results.noData')}
        </div>
      </Card>
    );
  }
  const isLargeDataset = data.length >= 100;
  const seriesAnimationActive = !isLargeDataset;
  const successLines = [
    { key: 'survival', color: CHART_COLORS[2], nameKey: 'monteCarlo.results.survivalProb' },
    {
      key: 'capitalPreservation',
      color: CHART_COLORS[0],
      nameKey: 'monteCarlo.results.preservationProb',
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
              value: t('monteCarlo.results.years'),
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
            isAnimationActive={!isLargeDataset}
            animationDuration={isLargeDataset ? 0 : 150}
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
  if (data.length === 0) {
    return (
      <Card className="p-5">
        <div className="py-6 text-center text-caption text-fg-tertiary">
          {t('monteCarlo.results.noData')}
        </div>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h4 className="mb-3 text-sm font-semibold tabular-nums text-fg-secondary">
          {t('monteCarlo.fanChart.title')}
        </h4>
        <FanChart data={data} />
      </Card>
      <MonteCarloTerminalHistogram r={r} startingValue={startingValue} />
    </div>
  );
}
