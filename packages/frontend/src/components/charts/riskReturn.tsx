import { useState, useMemo, memo } from 'react';
import {
  ScatterChart,
  Scatter,
  CartesianGrid,
  ResponsiveContainer,
  ZAxis,
  LabelList,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS, type AssetAnalysisResult, type PortfolioResult } from '@backtest/shared';
import { CHART_MARGIN, CHART_GRID_PROPS } from '@/lib/chart-theme.js';
import {
  ChartXAxis,
  ChartYAxis,
  ChartTooltip,
  ChartEmptyState,
  ScatterChartContent,
} from './sharedChartContent.js';
import { type RiskMetricKey } from './chartUtils.js';
import ChartCard from '../ChartCard.js';
interface ScatterPoint {
  name: string;
  risk: number;
  cagr: number;
  [key: string]: string | number;
}
function RiskMetricSelector({
  metrics,
  selected,
  onChange,
}: {
  metrics: Array<{ key: RiskMetricKey; label: string }>;
  selected: RiskMetricKey;
  onChange: (v: RiskMetricKey) => void;
}) {
  return (
    <select
      className="bg-input-bg text-fg border border-border-subtle rounded font-medium cursor-pointer"
      style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
      value={selected}
      onChange={(e) => onChange(e.target.value as RiskMetricKey)}
    >
      {metrics.map((m) => (
        <option key={m.key} value={m.key}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
function RiskScatterChart({ data, riskLabel }: { data: ScatterPoint[]; riskLabel: string }) {
  return (
    <ScatterChartContent
      data={data}
      xDataKey="risk"
      yDataKey="cagr"
      nameDataKey="name"
      xName={riskLabel}
      yName="CAGR"
      xLabel={`${riskLabel} (%)`}
      yLabel="CAGR (%)"
      tooltipFormatter={(value: number | string, name: string) =>
        name === 'risk'
          ? [`${typeof value === 'number' ? value.toFixed(2) : value}%`, riskLabel]
          : name === 'cagr'
            ? [`${typeof value === 'number' ? value.toFixed(2) : value}%`, 'CAGR']
            : [String(value), name]
      }
      tooltipLabelFormatter={() => ''}
    />
  );
}
export const RiskReturnChart = memo(function RiskReturnChart({
  results,
}: {
  results: AssetAnalysisResult;
}) {
  const { t } = useTranslation();
  const riskMetrics = [
    { key: 'stdev' as const, label: t('Annualized Volatility') },
    { key: 'maxDrawdown' as const, label: t('Max Drawdown') },
    { key: 'avgDrawdown' as const, label: t('Avg Drawdown') },
    { key: 'ulcerIndex' as const, label: t('Ulcer Index') },
  ];
  const [riskMetric, setRiskMetric] = useState<RiskMetricKey>('stdev');
  const scatterData = useMemo(
    () =>
      results.tickers.map((tk) => ({
        name: tk.ticker,
        risk: +(((tk.statistics[riskMetric] as number) ?? 0) * 100).toFixed(2),
        cagr: +((tk.statistics.cagr ?? 0) * 100).toFixed(2),
      })),
    [results, riskMetric],
  );
  const riskLabel = riskMetrics.find((m) => m.key === riskMetric)?.label ?? t('Risk');
  return (
    <div className="chart-card">
      <div className="flex items-center gap-4 mb-3">
        <div className="chart-card-title mb-0">{t('Risk vs Return')}</div>
        <RiskMetricSelector metrics={riskMetrics} selected={riskMetric} onChange={setRiskMetric} />
      </div>
      <RiskScatterChart data={scatterData} riskLabel={riskLabel} />
    </div>
  );
});
interface RiskReturnScatterProps {
  portfolios: PortfolioResult[];
}
interface RiskScatterPoint {
  name: string;
  stdev: number;
  cagr: number;
  sharpe: number;
}
function EmptyScatter() {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('Risk vs Return')}>
      <ChartEmptyState message={t('No data')} />
    </ChartCard>
  );
}
export function RiskReturnScatter({ portfolios }: RiskReturnScatterProps) {
  const { t } = useTranslation();
  if (portfolios.length === 0) return <EmptyScatter />;
  const data: RiskScatterPoint[] = portfolios.map((p) => ({
    name: p.name,
    stdev: +(p.statistics.stdev * 100).toFixed(2),
    cagr: +(p.statistics.cagr * 100).toFixed(2),
    sharpe: +p.statistics.sharpe.toFixed(2),
  }));
  const volLabel = t('Volatility');
  const retLabel = t('Return');
  return (
    <ChartCard
      title={t('Risk vs Return')}
      data={data.map((p): Record<string, string | number> => ({
        name: p.name,
        stdev: p.stdev,
        cagr: p.cagr,
        sharpe: p.sharpe,
      }))}
      csvFilename="risk-return"
    >
      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={CHART_MARGIN}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
          <ChartXAxis
            type="number"
            dataKey="stdev"
            name={volLabel}
            label={{
              value: t('Volatility (%)'),
              position: 'insideBottom',
              offset: -10,
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
            tickFormatter={(v: number | string) => `${Number(v).toFixed(1)}%`}
          />
          <ChartYAxis
            type="number"
            dataKey="cagr"
            name={retLabel}
            label={{
              value: t('Return (%)'),
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <ZAxis range={[80, 80]} />
          <ChartTooltip
            formatter={(value: number, name: string) =>
              name === 'stdev'
                ? [`${value.toFixed(2)}%`, volLabel]
                : name === 'cagr'
                  ? [`${value.toFixed(2)}%`, retLabel]
                  : [String(value), name]
            }
            labelFormatter={() => ''}
          />
          {data.map((point, idx) => (
            <Scatter key={point.name} data={[point]} fill={CHART_COLORS[idx % CHART_COLORS.length]}>
              <LabelList
                dataKey="name"
                position="right"
                style={{ fill: 'var(--text-muted)', fontSize: 11 }}
              />
            </Scatter>
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
