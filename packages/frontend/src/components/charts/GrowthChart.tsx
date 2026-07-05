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
import { CHART_COLORS } from '@backtest/shared/types';
import type { PortfolioResult, BaseCurrency } from '@backtest/shared/types';
import { CHART_TOOLTIP_STYLE } from '../chartHelpers';
import { ChartExporter } from '../ChartExporter';
import { downsample, SYNC_CHART_POINTS } from '../../hooks/useChartInteractions';
import { mergePortfolioSeries } from '../../utils/chartDataMerge';
import ChartCard from '../ChartCard';

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
  const chartData =
    mergedData.length > SYNC_CHART_POINTS ? downsample(mergedData, SYNC_CHART_POINTS) : mergedData;

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
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis
          dataKey="date"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(0, 7)}
        />
        <YAxis
          scale={logScale ? 'log' : 'linear'}
          domain={['auto', 'auto']}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
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
        <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
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
            tickFormatter={(v: string) => v.slice(0, 7)}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
