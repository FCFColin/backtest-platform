import { useState, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { AssetAnalysisResult } from '@backtest/shared';
import { tooltipStyle, type RiskMetricKey } from './analysisChartUtils.js';
import { CHART_GRID_PROPS, AXIS_TICK_STYLE } from './chartConstants.js';

function RiskMetricSelector({
  metrics,
  selected,
  onChange,
  t: _t,
}: {
  metrics: Array<{ key: RiskMetricKey; label: string }>;
  selected: RiskMetricKey;
  onChange: (v: RiskMetricKey) => void;
  t: (k: string) => string;
}) {
  return (
    <select
      className="param-input"
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

function RiskScatterChart({
  data,
  riskLabel,
  tooltipStyle,
}: {
  data: Array<{ name: string; risk: number; cagr: number }>;
  riskLabel: string;
  tooltipStyle: React.CSSProperties;
}) {
  return (
    <ResponsiveContainer width="100%" height={450}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis
          type="number"
          dataKey="risk"
          name={riskLabel}
          tick={AXIS_TICK_STYLE}
          label={{
            value: `${riskLabel} (%)`,
            position: 'insideBottom',
            offset: -10,
            style: { fill: 'var(--text-muted)', fontSize: 12 },
          }}
        />
        <YAxis
          type="number"
          dataKey="cagr"
          name="CAGR"
          tick={AXIS_TICK_STYLE}
          label={{
            value: 'CAGR (%)',
            angle: -90,
            position: 'insideLeft',
            style: { fill: 'var(--text-muted)', fontSize: 12 },
          }}
        />
        <ZAxis range={[80, 80]} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number, name: string) =>
            name === 'risk'
              ? [`${value.toFixed(2)}%`, riskLabel]
              : name === 'cagr'
                ? [`${value.toFixed(2)}%`, 'CAGR']
                : [value, name]
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
        <RiskMetricSelector
          metrics={riskMetrics}
          selected={riskMetric}
          onChange={setRiskMetric}
          t={t}
        />
      </div>
      <RiskScatterChart data={scatterData} riskLabel={riskLabel} tooltipStyle={tooltipStyle} />
    </div>
  );
});
