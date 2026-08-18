import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { type PortfolioResult } from '@backtest/shared';
import ChartCard from '../ChartCard.js';
import { getPortfolioColor } from '@/lib/chart-theme.js';
import { maybeDownsample } from '../../utils/format.js';
import { XYScatterChart } from './sharedChartContent.js';
import { TimeSeriesLineChart } from './TimeSeriesLineChart.js';
import { SimpleTable, type SimpleTableColumn } from '../tables.js';
import { computeDailyReturns } from './chartUtils.js';
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
  for (let i = 0; i < n; i += step)
    residuals.push({
      date: dates[i] || `${i}`,
      residual: +((yReturns[i] - (alpha + beta * xReturns[i])) * 100).toFixed(4),
    });
  return { alpha: alpha * 100, beta, rSquared, points, linePoints, residuals };
}
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
      <XYScatterChart
        xKey="x"
        yKey="y"
        xName={t('Benchmark Daily Return')}
        yName={t('Target Daily Return')}
        xLabel={t('{{name}} Daily Return', { name: baseName })}
        yLabel={t('{{name}} Daily Return', { name: reg.name })}
        height={400}
        xTickFormatter={(v: number) => `${Number(v).toFixed(2)}%`}
        yTickFormatter={(v: number) => `${Number(v).toFixed(2)}%`}
        tooltipFormatter={(value, name) => {
          if (name === 'x') return [`${Number(value).toFixed(4)}%`, t('Benchmark Daily Return')];
          if (name === 'y') return [`${Number(value).toFixed(4)}%`, t('Target Daily Return')];
          return [String(value), name];
        }}
        series={[{ data: scatterPoints, color, opacity: 0.4, symbolSize: 4 }]}
        lines={[
          {
            points: [
              [reg.linePoints[0].x, reg.linePoints[0].y],
              [reg.linePoints[1].x, reg.linePoints[1].y],
            ],
            color,
            dash: '6 3',
            width: 2,
          },
        ]}
      />
    </div>
  );
}
function RegressionStatsTable({ reg }: { reg: RegressionWithMeta }) {
  const { t } = useTranslation();
  const rows = [
    { label: 'Alpha', value: `${reg.alpha.toFixed(4)}%` },
    { label: 'Beta', value: reg.beta.toFixed(4) },
    { label: 'R²', value: reg.rSquared.toFixed(4) },
  ];
  const columns: SimpleTableColumn<(typeof rows)[number]>[] = [
    { key: 'metric', label: t('Metric'), render: (r) => r.label },
    { key: 'value', label: t('Value'), align: 'right', render: (r) => r.value },
  ];
  return (
    <div style={{ flex: '0 0 auto' }}>
      <SimpleTable columns={columns} data={rows} rowKey={(r) => r.label} />
    </div>
  );
}
function RegressionResidualChart({ reg, color }: { reg: RegressionWithMeta; color: string }) {
  const { t } = useTranslation();
  if (reg.residuals.length === 0) return null;
  return (
    <div>
      <div className="text-h3 font-semibold text-fg" style={{ marginTop: '8px' }}>
        {t('Residual Chart')}
      </div>
      <div className="text-label-tiny mb-2" style={{ color: 'hsl(var(--fg-tertiary))' }}>
        {t(
          'Regression residual: the portion of portfolio daily return above/below the regression model prediction',
        )}
      </div>
      <TimeSeriesLineChart
        data={reg.residuals}
        height={200}
        yTickFormatter={(v) => `${v.toFixed(2)}%`}
        tooltipValueFormatter={(v) => [`${v.toFixed(4)}%`, t('Residual')]}
        tooltipLabelFormatter={(label) => t('Date: {{label}}', { label })}
        yLabel={t('Residual')}
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
  const color = getPortfolioColor(colorIdx);
  const scatterPoints = maybeDownsample(reg.points);
  return (
    <ChartCard
      title={t('{{baseName}} vs {{targetName}}', { baseName, targetName: reg.name })}
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
      <ChartCard title={t('tabs.regression')}>
        <div
          style={{
            color: 'hsl(var(--fg-tertiary))',
            fontSize: '13px',
            padding: '40px 0',
            textAlign: 'center',
          }}
        >
          {t('At least 2 portfolios required')}
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
