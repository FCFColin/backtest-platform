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
import type { MonteCarloResult } from '@backtest/shared';
import {
  CHART_GRID_PROPS,
  CHART_TOOLTIP_STYLE,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  getPortfolioColor,
} from '@/lib/chart-theme.js';
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
      <h4 className="mb-3 text-sm font-semibold text-fg-secondary tabular-nums">
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
            color: getPortfolioColor(3),
            value: t('charts.annualReturn.p5', { value: fmtDollar(p5Val) }),
          },
          {
            label: p50Label,
            color: getPortfolioColor(2),
            value: t('Median', { value: fmtDollar(p50Val) }),
          },
          {
            label: p95Label,
            color: getPortfolioColor(4),
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
  const anim = useChartAnimation(data.length >= 100);
  if (data.length === 0) return <NoDataCard />;
  const successLines = [
    { key: 'survival', color: getPortfolioColor(2), nameKey: 'monteCarlo.results.survivalProb' },
    {
      key: 'capitalPreservation',
      color: getPortfolioColor(0),
      nameKey: 'Capital Preservation',
    },
    { key: 'profit', color: getPortfolioColor(1), nameKey: 'monteCarlo.results.profitProb' },
  ];
  return (
    <Card className="p-5">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="year"
            tick={AXIS_TICK_STYLE}
            label={{
              value: t('Years'),
              position: 'insideBottom',
              offset: -5,
              fontSize: 12,
              fill: 'hsl(var(--fg-tertiary))',
            }}
          />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
          <Tooltip
            formatter={(v: number) => `${v}%`}
            contentStyle={CHART_TOOLTIP_STYLE}
            {...anim}
          />
          <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
          {successLines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={2}
              dot={false}
              name={t(l.nameKey)}
              isAnimationActive={anim.isAnimationActive}
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
