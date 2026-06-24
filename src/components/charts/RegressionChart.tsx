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
import { CHART_COLORS } from '../../../shared/types';
import type { PortfolioResult } from '../../../shared/types';
import { ChartExporter } from '../ChartExporter';
import { downsample } from '../../hooks/useChartInteractions';

/** 回归散点图 Props */
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

function computeDailyReturns(curve: Array<{ date: string; value: number }>): number[] {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1].value > 0) {
      returns.push((curve[i].value - curve[i - 1].value) / curve[i - 1].value);
    }
  }
  return returns;
}

function computeRegression(xReturns: number[], yReturns: number[], dates: string[]): RegressionResult {
  const n = Math.min(xReturns.length, yReturns.length);
  if (n < 2) {
    return { alpha: 0, beta: 0, rSquared: 0, points: [], linePoints: [], residuals: [] };
  }

  const points: ScatterPoint[] = [];
  for (let i = 0; i < n; i++) {
    points.push({ x: +(xReturns[i] * 100).toFixed(4), y: +(yReturns[i] * 100).toFixed(4) });
  }

  const xMean = xReturns.reduce((s, v) => s + v, 0) / n;
  const yMean = yReturns.reduce((s, v) => s + v, 0) / n;

  let ssXY = 0;
  let ssXX = 0;
  let ssYY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xReturns[i] - xMean;
    const dy = yReturns[i] - yMean;
    ssXY += dx * dy;
    ssXX += dx * dx;
    ssYY += dy * dy;
  }

  const beta = ssXX > 0 ? ssXY / ssXX : 0;
  const alpha = yMean - beta * xMean;
  const rSquared = ssYY > 0 ? (ssXY * ssXY) / (ssXX * ssYY) : 0;

  const xMin = Math.min(...xReturns) * 100;
  const xMax = Math.max(...xReturns) * 100;

  const linePoints: ScatterPoint[] = [
    { x: +xMin.toFixed(4), y: +((alpha + beta * xMin / 100) * 100).toFixed(4) },
    { x: +xMax.toFixed(4), y: +((alpha + beta * xMax / 100) * 100).toFixed(4) },
  ];

  const residuals: Array<{ date: string; residual: number }> = [];
  const step = Math.max(1, Math.floor(n / 500));
  for (let i = 0; i < n; i += step) {
    const predicted = alpha + beta * xReturns[i];
    const residual = (yReturns[i] - predicted) * 100;
    residuals.push({
      date: dates[i] || `${i}`,
      residual: +residual.toFixed(4),
    });
  }

  return {
    alpha: alpha * 100,
    beta,
    rSquared,
    points,
    linePoints,
    residuals,
  };
}

export default function RegressionChart({ portfolios }: RegressionChartProps) {
  const basePortfolio = portfolios[0];

  const regressions = useMemo(() => {
    if (portfolios.length < 2) return [];
    const baseReturns = computeDailyReturns(basePortfolio.growthCurve);
    const dates = basePortfolio.growthCurve.slice(1).map(p => p.date);
    return portfolios.slice(1).map((target) => {
      const targetReturns = computeDailyReturns(target.growthCurve);
      return {
        name: target.name,
        ...computeRegression(baseReturns, targetReturns, dates),
      };
    });
  }, [portfolios, basePortfolio]);

  if (portfolios.length < 2) {
    return (
      <div className="chart-card">
        <div className="chart-card-title">回归分析</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>
          至少需要2个组合
        </div>
      </div>
    );
  }

  return (
    <div>
      {regressions.map((reg, idx) => {
        // 大数据集（>10000 点）降采样以保持散点渲染流畅，CSV 导出仍使用完整 reg.points
        const scatterPoints = reg.points.length > 10000 ? downsample(reg.points, 1000) : reg.points;
        return (
        <div key={reg.name} className="chart-card" style={{ marginBottom: idx < regressions.length - 1 ? '16px' : 0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="chart-card-title mb-0">
              回归分析: {basePortfolio.name} vs {reg.name}
            </div>
            <ChartExporter data={reg.points.map((p): Record<string, string | number> => ({ x: p.x, y: p.y }))} filename={`regression-${reg.name}`} />
          </div>

          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ flex: '1 1 300px', minWidth: 0 }}>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="基准日收益率"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    label={{ value: `${basePortfolio.name} 日收益率 (%)`, position: 'insideBottom', offset: -10, style: { fill: 'var(--text-muted)', fontSize: 12 } }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="目标日收益率"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    label={{ value: `${reg.name} 日收益率 (%)`, angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 12 } }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: 'var(--radius-control)',
                      color: 'var(--text-body)',
                      fontSize: '12px',
                      boxShadow: 'var(--shadow-md)',
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === '基准日收益率' || name === 'x') return [`${value.toFixed(4)}%`, '基准日收益率'];
                      if (name === '目标日收益率' || name === 'y') return [`${value.toFixed(4)}%`, '目标日收益率'];
                      return [value, name];
                    }}
                    labelFormatter={() => ''}
                  />
                  <ReferenceLine
                    segment={[
                      { x: reg.linePoints[0].x, y: reg.linePoints[0].y },
                      { x: reg.linePoints[1].x, y: reg.linePoints[1].y },
                    ]}
                    stroke={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
                    strokeDasharray="6 3"
                    strokeWidth={2}
                  />
                  <Scatter
                    data={scatterPoints}
                    fill={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
                    fillOpacity={0.4}
                    r={2}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <div style={{ flex: '0 0 auto' }}>
              <table className="w-full border-collapse" style={{ minWidth: '200px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                    <th className="text-[12px] font-semibold text-left py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                      指标
                    </th>
                    <th className="text-[12px] font-semibold text-right py-2 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' }}>
                      值
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                    <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>Alpha</td>
                    <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                      {reg.alpha.toFixed(4)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>Beta</td>
                    <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                      {reg.beta.toFixed(4)}
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
                    <td className="text-[13px] py-2 px-3" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}>R²</td>
                    <td className="text-[13px] font-medium text-right py-2 px-3 font-mono" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}>
                      {reg.rSquared.toFixed(4)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {reg.residuals.length > 0 && (
            <div>
              <div className="chart-card-title" style={{ marginTop: '8px' }}>残差图</div>
              <div className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                残差 = 实际收益 − 拟合收益，偏离0越远说明模型拟合越差
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={reg.residuals} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    tickFormatter={(v: string) => v.slice(0, 7)}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                    label={{ value: '残差 (%)', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 12 } }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: 'var(--radius-control)',
                      color: 'var(--text-body)',
                      fontSize: '12px',
                      boxShadow: 'var(--shadow-md)',
                    }}
                    formatter={(value: number) => [`${value.toFixed(4)}%`, '残差']}
                    labelFormatter={(label: string) => `日期: ${label}`}
                  />
                  <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="residual"
                    stroke={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
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
                      tickFormatter={(v: string) => v.slice(0, 7)}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
