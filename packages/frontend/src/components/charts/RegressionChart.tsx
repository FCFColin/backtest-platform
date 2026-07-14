/**
 * @file 回归散点图
 * @description 绘制因子回归散点图及拟合回归线，展示组合收益与因子的线性关系
 */
import { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
  Brush,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult } from '@backtest/shared';
import { ChartExporter } from '../ChartExporter.js';
import {
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  DATE_TICK_FORMATTER,
} from './chartConstants.js';
import {
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../hooks/useChartInteractions.js';
import { CHART_TOOLTIP_STYLE } from '../chartHelpers.js';

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

function computeDailyReturns(curve: Array<{ date: string; value: number }>): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1].value > 0)
      returns.push((curve[i].value - curve[i - 1].value) / curve[i - 1].value);
  }
  return returns;
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

const TH_STYLE: React.CSSProperties = {
  color: 'var(--text-muted)',
  borderBottom: '2px solid var(--border-soft)',
};
const TD_STYLE: React.CSSProperties = {
  color: 'var(--text-body)',
  borderBottom: '1px solid var(--border-soft)',
};
const TD_VAL_STYLE: React.CSSProperties = {
  color: 'var(--text-strong)',
  borderBottom: '1px solid var(--border-soft)',
};

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
  return (
    <div style={{ flex: '1 1 300px', minWidth: 0 }}>
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis
            type="number"
            dataKey="x"
            name="基准日收益率"
            tick={AXIS_TICK_STYLE}
            label={{
              value: `${baseName} 日收益率 (%)`,
              position: 'insideBottom',
              offset: -10,
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="目标日收益率"
            tick={AXIS_TICK_STYLE}
            label={{
              value: `${reg.name} 日收益率 (%)`,
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number, name: string) => {
              if (name === '基准日收益率' || name === 'x')
                return [`${value.toFixed(4)}%`, '基准日收益率'];
              if (name === '目标日收益率' || name === 'y')
                return [`${value.toFixed(4)}%`, '目标日收益率'];
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
  return (
    <div style={{ flex: '0 0 auto' }}>
      <table className="w-full border-collapse" style={{ minWidth: '200px' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <th className="text-[12px] font-semibold text-left py-2 px-3" style={TH_STYLE}>
              指标
            </th>
            <th className="text-[12px] font-semibold text-right py-2 px-3" style={TH_STYLE}>
              值
            </th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <td className="text-[13px] py-2 px-3" style={TD_STYLE}>
              Alpha
            </td>
            <td
              className="text-[13px] font-medium text-right py-2 px-3 font-mono"
              style={TD_VAL_STYLE}
            >
              {reg.alpha.toFixed(4)}%
            </td>
          </tr>
          <tr>
            <td className="text-[13px] py-2 px-3" style={TD_STYLE}>
              Beta
            </td>
            <td
              className="text-[13px] font-medium text-right py-2 px-3 font-mono"
              style={TD_VAL_STYLE}
            >
              {reg.beta.toFixed(4)}
            </td>
          </tr>
          <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
            <td className="text-[13px] py-2 px-3" style={TD_STYLE}>
              R²
            </td>
            <td
              className="text-[13px] font-medium text-right py-2 px-3 font-mono"
              style={TD_VAL_STYLE}
            >
              {reg.rSquared.toFixed(4)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** 回归残差图 */
function RegressionResidualChart({ reg, color }: { reg: RegressionWithMeta; color: string }) {
  if (reg.residuals.length === 0) return null;
  return (
    <div>
      <div className="chart-card-title" style={{ marginTop: '8px' }}>
        残差图
      </div>
      <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
        残差 = 实际收益 − 拟合收益，偏离0越远说明模型拟合越差
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={reg.residuals} margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            tickFormatter={DATE_TICK_FORMATTER}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={AXIS_TICK_STYLE}
            tickFormatter={(v: number) => `${v.toFixed(2)}%`}
            label={{
              value: '残差 (%)',
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(value: number) => [`${value.toFixed(4)}%`, '残差']}
            labelFormatter={(label: string) => `日期: ${label}`}
          />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="residual"
            stroke={color}
            strokeWidth={1}
            dot={false}
            activeDot={{ r: 2 }}
          />
          {reg.residuals.length > 100 && (
            <Brush
              dataKey="date"
              height={20}
              stroke="var(--brand)"
              travellerWidth={8}
              tickFormatter={DATE_TICK_FORMATTER}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
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
  const color = CHART_COLORS[colorIdx % CHART_COLORS.length];
  const scatterPoints =
    reg.points.length > DOWNSAMPLE_THRESHOLD
      ? downsample(reg.points, DOWNSAMPLE_TARGET)
      : reg.points;

  return (
    <div className="chart-card" style={{ marginBottom: isLast ? 0 : '16px' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="chart-card-title mb-0">
          回归分析: {baseName} vs {reg.name}
        </div>
        <ChartExporter
          data={reg.points.map((p): Record<string, string | number> => ({ x: p.x, y: p.y }))}
          filename={`regression-${reg.name}`}
        />
      </div>
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
    </div>
  );
}

export default function RegressionChart({ portfolios }: RegressionChartProps) {
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
      <div className="chart-card">
        <div className="chart-card-title">回归分析</div>
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '13px',
            padding: '40px 0',
            textAlign: 'center',
          }}
        >
          至少需要2个组合
        </div>
      </div>
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
