/**
 * @file 分析页风险收益散点图
 * @description 以可选风险指标为横轴、CAGR 为纵轴绘制散点图，对比各标的的风险收益比。
 * 与回测页的 RiskReturnScatter 不同：本组件接收 AssetAnalysisResult，展示各标的分布。
 */
import { useState, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetAnalysisResult } from '@backtest/shared';
import { type RiskMetricKey } from './chartCalculations.js';
import { ScatterChartContent } from './sharedChartContent.js';

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
