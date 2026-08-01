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
import { CHART_COLORS } from '@backtest/shared';
import type { AssetAnalysisResult, PortfolioResult } from '@backtest/shared';
import { CHART_MARGIN, CHART_GRID_PROPS } from '@/lib/chart-theme.js';
import { ChartXAxis, ChartYAxis, ChartTooltip, ScatterChartContent } from './sharedChartContent.js';
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
    { key: 'stdev' as const, label: t('backtest.stdev') },
    { key: 'maxDrawdown' as const, label: t('backtest.maxDrawdown') },
    { key: 'avgDrawdown' as const, label: t('analysis.avgDrawdown') },
    { key: 'ulcerIndex' as const, label: t('analysis.ulcerIndex') },
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
  const riskLabel = riskMetrics.find((m) => m.key === riskMetric)?.label ?? t('analysis.risk');
  return (
    <div className="chart-card">
      <div className="flex items-center gap-4 mb-3">
        <div className="chart-card-title mb-0">{t('analysis.riskVsReturn')}</div>
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
    <ChartCard title={t('charts.riskReturn.title')}>
      <div
        style={{
          color: 'var(--text-muted)',
          fontSize: '13px',
          padding: '40px 0',
          textAlign: 'center',
        }}
      >
        {t('charts.riskReturn.noData')}
      </div>
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
  return (
    <ChartCard
      title={t('charts.riskReturn.title')}
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
            name={t('charts.riskReturn.volatility')}
            label={{
              value: t('charts.riskReturn.volatilityAxis'),
              position: 'insideBottom',
              offset: -10,
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
            tickFormatter={(v: number | string) => `${Number(v).toFixed(1)}%`}
          />
          <ChartYAxis
            type="number"
            dataKey="cagr"
            name={t('charts.riskReturn.returnRate')}
            label={{
              value: t('charts.riskReturn.returnAxis'),
              angle: -90,
              position: 'insideLeft',
              style: { fill: 'var(--text-muted)', fontSize: 12 },
            }}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <ZAxis range={[80, 80]} />
          <ChartTooltip
            formatter={(value: number, name: string) => {
              if (name === 'stdev')
                return [`${value.toFixed(2)}%`, t('charts.riskReturn.volatility')];
              if (name === 'cagr')
                return [`${value.toFixed(2)}%`, t('charts.riskReturn.returnRate')];
              return [String(value), name];
            }}
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
