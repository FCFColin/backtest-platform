import { useState, useMemo, memo } from 'react';
import { Scatter, LabelList } from 'recharts';
import { useTranslation } from 'react-i18next';
import { CHART_COLORS, type AssetAnalysisResult, type PortfolioResult } from '@backtest/shared';
import { ChartEmptyState, ScatterChartContent, XYScatterChart } from './sharedChartContent.js';
import { type RiskMetricKey } from './chartUtils.js';
import ChartCard from '../ChartCard.js';
import { MiniSelect } from '@/components/ui/uiComponents';
interface ScatterPoint {
  name: string;
  risk: number;
  cagr: number;
  [key: string]: string | number;
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
    <ChartCard
      title={t('Risk vs Return')}
      headerExtra={
        <MiniSelect
          value={riskMetric}
          onChange={setRiskMetric}
          options={riskMetrics.map((m) => ({ value: m.key, label: m.label }))}
          width={130}
        />
      }
    >
      <RiskScatterChart data={scatterData} riskLabel={riskLabel} />
    </ChartCard>
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
      <XYScatterChart
        xKey="stdev"
        yKey="cagr"
        xName={volLabel}
        yName={retLabel}
        height={400}
        zRange={[80, 80]}
        xTickFormatter={(v) => `${v.toFixed(1)}%`}
        yTickFormatter={(v) => `${v.toFixed(1)}%`}
        labelFormatter={() => ''}
        tooltipFormatter={(value: number, name: string) =>
          name === 'stdev'
            ? [`${value.toFixed(2)}%`, volLabel]
            : name === 'cagr'
              ? [`${value.toFixed(2)}%`, retLabel]
              : [String(value), name]
        }
      >
        {data.map((point, idx) => (
          <Scatter key={point.name} data={[point]} fill={CHART_COLORS[idx % CHART_COLORS.length]}>
            <LabelList
              dataKey="name"
              position="right"
              style={{ fill: 'var(--text-muted)', fontSize: 11 }}
            />
          </Scatter>
        ))}
      </XYScatterChart>
    </ChartCard>
  );
}
