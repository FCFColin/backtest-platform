/**
 * @file 净值增长曲线图
 * @description 展示各投资组合的净值增长曲线，支持线性和对数坐标切换及基准货币换算
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult, BaseCurrency } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE } from './chartConstants.js';
import { ChartExporter } from '../ChartExporter.js';
import { useChartData, CHART_MAX_POINTS } from '../../hooks/useChartInteractions.js';
import { mergePortfolioSeries } from '../../utils/chartDataMerge.js';
import ChartCard from '../ChartCard.js';
import {
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
} from './chartConstants.js';

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

function GrowthChartContent({
  chartData,
  portfolios,
  logScale,
  baseCurrency,
  t,
}: GrowthChartContentProps) {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
        <YAxis
          scale={logScale ? 'log' : 'linear'}
          domain={['auto', 'auto']}
          tick={AXIS_TICK_STYLE}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
          formatter={(value: number) => [
            `${CURRENCY_SYMBOL[baseCurrency]}${value.toLocaleString()}`,
            '',
          ]}
        />
        <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
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
        {chartData.length > 100 && (
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
  );
}
