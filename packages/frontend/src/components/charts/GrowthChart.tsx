/**
 * @file 净值增长曲线图
 * @description 展示各投资组合的净值增长曲线，支持线性和对数坐标切换及基准货币换算
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, CartesianGrid, ResponsiveContainer } from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult, BaseCurrency } from '@backtest/shared';
import { ChartExporter } from '../ChartExporter.js';
import { useChartData, CHART_MAX_POINTS } from '../../hooks/useChartInteractions.js';
import { mergePortfolioSeries } from '../../utils/chartDataMerge.js';
import ChartCard from '../ChartCard.js';
import { CHART_MARGIN, CHART_GRID_PROPS } from './chartConstants.js';
import { ChartXAxis, ChartYAxis, ChartTooltip, ChartLegend } from './ChartAxis.js';

/** 货币符号映射 */
const CURRENCY_SYMBOL: Record<BaseCurrency, string> = { usd: '$', cny: '¥' };

/** 净值增长曲线图 Props */
interface GrowthChartProps {
  portfolios: PortfolioResult[];
  /** 基准货币，用于换算并展示统一货币口径的净值 */
  baseCurrency?: BaseCurrency;
  /** 外层已提供 chart-card 标题时设为 true，避免重复标题与容器 */
  embedded?: boolean;
}

export default function GrowthChart({
  portfolios,
  baseCurrency = 'usd',
  embedded = false,
}: GrowthChartProps) {
  const { t } = useTranslation();
  const [logScale, setLogScale] = useState(false);

  const mergedData = mergePortfolioSeries(
    portfolios,
    (p) => p.growthCurve,
    (pt) => pt.date,
    (pt) => pt.value,
  );
  const chartData = useChartData(mergedData, CHART_MAX_POINTS);

  const logToggle = (
    <button
      onClick={() => setLogScale(!logScale)}
      className="px-2.5 py-1 text-[12px] border transition-colors"
      style={{
        borderRadius: 'var(--radius-control)',
        backgroundColor: logScale ? 'var(--brand)' : 'var(--bg-elevated)',
        color: logScale ? '#fff' : 'var(--text-muted)',
        borderColor: logScale ? 'var(--brand)' : 'var(--border-soft)',
      }}
    >
      {t('charts.logScale')}
    </button>
  );

  if (embedded) {
    return (
      <>
        <div className="flex items-center justify-end gap-2 mb-3">
          {logToggle}
          <ChartExporter data={mergedData} filename="growth" />
        </div>
        <GrowthChartContent
          chartData={chartData}
          portfolios={portfolios}
          logScale={logScale}
          baseCurrency={baseCurrency}
          t={t}
        />
      </>
    );
  }

  return (
    <ChartCard
      title={t('backtest.growth')}
      data={mergedData}
      csvFilename="growth"
      headerExtra={logToggle}
    >
      <GrowthChartContent
        chartData={chartData}
        portfolios={portfolios}
        logScale={logScale}
        baseCurrency={baseCurrency}
        t={t}
      />
    </ChartCard>
  );
}

interface GrowthChartContentProps {
  chartData: Array<Record<string, unknown>>;
  portfolios: PortfolioResult[];
  logScale: boolean;
  baseCurrency: BaseCurrency;
  t: (key: string) => string;
}

/** 从图表数据中提取所有正值的最小值和最大值。 */
function extractValueRange(
  chartData: Array<Record<string, unknown>>,
  portfolios: PortfolioResult[],
): { min: number; max: number } | null {
  const keys = portfolios.map((p) => p.name);
  let min = Infinity;
  let max = -Infinity;
  for (const row of chartData) {
    for (const key of keys) {
      const v = row[key];
      if (typeof v !== 'number' || !isFinite(v) || v <= 0) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return isFinite(min) && isFinite(max) ? { min, max } : null;
}

/** 计算对数坐标的 Y 轴域（确保所有值为正）。 */
function useLogDomain(
  chartData: Array<Record<string, unknown>>,
  portfolios: PortfolioResult[],
): [number, number] | undefined {
  return useMemo(() => {
    const range = extractValueRange(chartData, portfolios);
    if (!range) return undefined;
    const padding = (range.max / range.min) ** 0.1;
    return [range.min / padding, range.max * padding] as [number, number];
  }, [chartData, portfolios]);
}

function GrowthChartContent({
  chartData,
  portfolios,
  logScale,
  baseCurrency,
  t,
}: GrowthChartContentProps) {
  const logDomain = useLogDomain(chartData, logScale ? portfolios : []);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <ChartXAxis />
        <ChartYAxis
          scale={logScale ? 'log' : 'linear'}
          domain={logDomain ?? ['auto', 'auto']}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
        />
        <ChartTooltip
          labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
          formatter={(value: number) => [
            `${CURRENCY_SYMBOL[baseCurrency]}${value.toLocaleString()}`,
            '',
          ]}
        />
        <ChartLegend />
        {portfolios.map((p, idx) => (
          <Line
            key={p.name}
            type="monotone"
            dataKey={p.name}
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
