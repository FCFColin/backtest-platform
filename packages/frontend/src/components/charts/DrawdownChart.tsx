/**
 * @file 回撤面积图
 * @description 展示各投资组合的历史回撤曲线，以面积图形式直观呈现下行风险
 */
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Brush,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult } from '@backtest/shared';
import { CHART_TOOLTIP_STYLE } from '../chartHelpers.js';
import ChartCard from '../ChartCard.js';
import { ChartExporter } from '../ChartExporter.js';
import { downsample, SYNC_CHART_POINTS } from '../../hooks/useChartInteractions.js';
import { useTranslation } from 'react-i18next';
import { mergePortfolioSeries } from '../../utils/chartDataMerge.js';

/** 回撤面积图 Props */
interface DrawdownChartProps {
  portfolios: PortfolioResult[];
  /** 外层已提供 chart-card 标题时设为 true */
  embedded?: boolean;
}

export default function DrawdownChart({ portfolios, embedded = false }: DrawdownChartProps) {
  const { t } = useTranslation();
  const mergedData = mergePortfolioSeries(
    portfolios,
    (p) => p.drawdownCurve,
    (pt) => pt.date,
    (pt) => +(pt.drawdown * -100).toFixed(2),
  );
  const chartData =
    mergedData.length > SYNC_CHART_POINTS ? downsample(mergedData, SYNC_CHART_POINTS) : mergedData;

  const chart = (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-subtle)" />
        <XAxis
          dataKey="date"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(0, 7)}
        />
        <YAxis
          domain={['auto', 0]}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
          formatter={(value: number) => [`${value.toFixed(2)}%`, '']}
        />
        <Legend wrapperStyle={{ fontSize: '12px', color: 'var(--text-muted)' }} />
        {portfolios.map((p, idx) => (
          <Area
            key={p.name}
            type="monotone"
            dataKey={p.name}
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            fill={CHART_COLORS[idx % CHART_COLORS.length]}
            fillOpacity={0.12}
            strokeWidth={1.5}
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
      </AreaChart>
    </ResponsiveContainer>
  );

  if (embedded) {
    return (
      <>
        <div className="flex justify-end mb-2">
          <ChartExporter data={mergedData} filename="drawdown" />
        </div>
        {chart}
      </>
    );
  }

  return (
    <ChartCard title={t('backtest.drawdown')} data={mergedData} csvFilename="drawdown">
      {chart}
    </ChartCard>
  );
}
