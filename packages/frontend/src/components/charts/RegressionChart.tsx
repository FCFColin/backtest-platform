/**
 * @file 回归散点图
 * @description 绘制因子回归散点图及拟合回归线，展示组合收益与因子的线性关系
 */
import { useMemo } from 'react';
import { ScatterChart, Scatter, CartesianGrid, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult } from '@backtest/shared';
import ChartCard from '../ChartCard.js';
import { CHART_GRID_PROPS } from './chartConstants.js';
import {
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../hooks/useChartInteractions.js';
import { ChartXAxis, ChartYAxis, ChartTooltip } from './ChartAxis.js';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';
import { SimpleTable } from '../SimpleTable.js';
import type { SimpleTableColumn } from '../SimpleTable.js';
import { computeDailyReturns } from './correlationDataTransforms.js';

interface RegressionChartProps {
  portfolios: PortfolioResult[];
}
interface ScatterPoint {
  x: number;
  y: number;
}
interface RegressionResult {
  alpha: number;
  beta: number;
  rSquared: number;
  points: ScatterPoint[];
  linePoints: ScatterPoint[];
  residuals: Array<{ date: string; residual: number }>;
}
interface RegressionWithMeta extends RegressionResult {
  name: string;
}

function computeRegression(
  xReturns: number[],
  yReturns: number[],
  dates: string[],
): RegressionResult {
  const n = Math.min(xReturns.length, yReturns.length);
  if (n < 2) return { alpha: 0, beta: 0, rSquared: 0, points: [], linePoints: [], residuals: [] };

  const points: ScatterPoint[] = [];
  for (let i = 0; i < n; i++)
    points.push({ x: +(xReturns[i] * 100).toFixed(4), y: +(yReturns[i] * 100).toFixed(4) });

  const xMean = xReturns.reduce((s, v) => s + v, 0) / n;
  const yMean = yReturns.reduce((s, v) => s + v, 0) / n;
  let ssXY = 0,
    ssXX = 0,
    ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xReturns[i] - xMean,
      dy = yReturns[i] - yMean;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }
  const beta = ssXX > 0 ? ssXY / ssXX : 0;
  const alpha = yMean - beta * xMean;
  const rSquared = ssYY > 0 ? (ssXY * ssXY) / (ssXX * ssYY) : 0;
  const xMin = Math.min(...xReturns) * 100,
    xMax = Math.max(...xReturns) * 100;
  const linePoints: ScatterPoint[] = [
    { x: +xMin.toFixed(4), y: +((alpha + (beta * xMin) / 100) * 100).toFixed(4) },
    { x: +xMax.toFixed(4), y: +((alpha + (beta * xMax) / 100) * 100).toFixed(4) },
  ];

  const residuals: Array<{ date: string; residual: number }> = [];
  const step = Math.max(1, Math.floor(n / 500));
  for (let i = 0; i < n; i += step) {
    residuals.push({
      date: dates[i] || `${i}`,
      residual: +((yReturns[i] - (alpha + beta * xReturns[i])) * 100).toFixed(4),
    });
  }
  return { alpha: alpha * 100, beta, rSquared, points, linePoints, residuals };
}

/** 回归散点图 */
function RegressionScatterChart({
  reg,
  baseName,
  color,
  scatterPoints,
}: {
  reg: RegressionWithMeta;
  baseName: string;
  color: string;
  scatterPoints: typeof reg.points;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ flex: '1 1 300px', minWidth: 0 }}>
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <ChartXAxis
            type="number"
            dataKey="x"
            name={t('charts.regression.baseDailyReturn')}
            label={t('charts.regression.dailyReturnAxis', { name: baseName })}
          />
          <ChartYAxis
            type="number"
            dataKey="y"
            name={t('charts.regression.targetDailyReturn')}
            label={t('charts.regression.dailyReturnAxis', { name: reg.name })}
          />
          <ChartTooltip
            formatter={(value: number, name: string) => {
              if (name === 'x')
                return [`${value.toFixed(4)}%`, t('charts.regression.baseDailyReturn')];
              if (name === 'y')
                return [`${value.toFixed(4)}%`, t('charts.regression.targetDailyReturn')];
              return [value, name];
            }}
            labelFormatter={() => ''}
          />
          <ReferenceLine
            segment={[
              { x: reg.linePoints[0].x, y: reg.linePoints[0].y },
              { x: reg.linePoints[1].x, y: reg.linePoints[1].y },
            ]}
            stroke={color}
            strokeDasharray="6 3"
            strokeWidth={2}
          />
          <Scatter data={scatterPoints} fill={color} fillOpacity={0.4} r={2} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 回归统计表 */
function RegressionStatsTable({ reg }: { reg: RegressionWithMeta }) {
  const { t } = useTranslation();
  const rows = [
    { label: 'Alpha', value: `${reg.alpha.toFixed(4)}%` },
    { label: 'Beta', value: reg.beta.toFixed(4) },
    { label: 'R²', value: reg.rSquared.toFixed(4) },
  ];
  const columns: SimpleTableColumn<(typeof rows)[number]>[] = [
    { key: 'metric', label: t('charts.regression.metric'), render: (r) => r.label },
    {
      key: 'value',
      label: t('charts.regression.value'),
      align: 'right',
      render: (r) => r.value,
    },
  ];
  return (
    <div style={{ flex: '0 0 auto' }}>
      <SimpleTable columns={columns} data={rows} rowKey={(r) => r.label} />
    </div>
  );
}

/** 回归残差图 */
function RegressionResidualChart({ reg, color }: { reg: RegressionWithMeta; color: string }) {
  const { t } = useTranslation();
  if (reg.residuals.length === 0) return null;
  return (
    <div>
      <div className="chart-card-title" style={{ marginTop: '8px' }}>
        {t('charts.regression.residualChartTitle')}
      </div>
      <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
        {t('charts.regression.residualDesc')}
      </div>
      <TimeSeriesLineChart
        data={reg.residuals}
        height={200}
        yTickFormatter={(v) => `${v.toFixed(2)}%`}
        tooltipValueFormatter={(v) => [`${v.toFixed(4)}%`, t('charts.regression.residual')]}
        tooltipLabelFormatter={(label) => t('charts.regression.dateLabel', { label })}
        yLabel={t('charts.regression.residualAxisLabel')}
        referenceY={0}
        showBrush
        xTickInterval="preserveStartEnd"
        xTickFontSize={10}
        defaultStrokeWidth={1}
        showLegend={false}
        series={[{ dataKey: 'residual', color, activeDotR: 2 }]}
      />
    </div>
  );
}

/** 单个回归面板：散点图 + 统计表 + 残差图 */
function RegressionPanel({
  reg,
  baseName,
  colorIdx,
  isLast,
}: {
  reg: RegressionWithMeta;
  baseName: string;
  colorIdx: number;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const color = CHART_COLORS[colorIdx % CHART_COLORS.length];
  const scatterPoints =
    reg.points.length > DOWNSAMPLE_THRESHOLD
      ? downsample(reg.points, DOWNSAMPLE_TARGET)
      : reg.points;

  return (
    <ChartCard
      title={t('charts.regression.panelTitle', { baseName, targetName: reg.name })}
      data={reg.points.map((p): Record<string, string | number> => ({ x: p.x, y: p.y }))}
      csvFilename={`regression-${reg.name}`}
      style={{ marginBottom: isLast ? 0 : '16px' }}
    >
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <RegressionScatterChart
          reg={reg}
          baseName={baseName}
          color={color}
          scatterPoints={scatterPoints}
        />
        <RegressionStatsTable reg={reg} />
      </div>
      <RegressionResidualChart reg={reg} color={color} />
    </ChartCard>
  );
}

export default function RegressionChart({ portfolios }: RegressionChartProps) {
  const { t } = useTranslation();
  const basePortfolio = portfolios[0];

  const regressions = useMemo<RegressionWithMeta[]>(() => {
    if (portfolios.length < 2) return [];
    const baseReturns = computeDailyReturns(basePortfolio.growthCurve);
    const dates = basePortfolio.growthCurve.slice(1).map((p) => p.date);
    return portfolios.slice(1).map((target) => ({
      name: target.name,
      ...computeRegression(baseReturns, computeDailyReturns(target.growthCurve), dates),
    }));
  }, [portfolios, basePortfolio]);

  if (portfolios.length < 2) {
    return (
      <ChartCard title={t('charts.regression.title')}>
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '13px',
            padding: '40px 0',
            textAlign: 'center',
          }}
        >
          {t('charts.regression.needTwoPortfolios')}
        </div>
      </ChartCard>
    );
  }

  return (
    <div>
      {regressions.map((reg, idx) => (
        <RegressionPanel
          key={reg.name}
          reg={reg}
          baseName={basePortfolio.name}
          colorIdx={idx + 1}
          isLast={idx === regressions.length - 1}
        />
      ))}
    </div>
  );
}
