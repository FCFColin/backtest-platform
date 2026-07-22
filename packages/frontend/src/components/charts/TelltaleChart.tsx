/**
 * @file Telltale 走势对比图
 * @description 展示各组合相对基准的累计收益比（Telltale Chart），用于判断相对强弱
 *
 * 支持两种输入模式：
 * - 回测模式：portfolios: PortfolioResult[]（BacktestPage 使用）
 * - 分析模式：results: AssetAnalysisResult（AnalysisPage 使用）
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import type { PortfolioResult, AssetAnalysisResult } from '@backtest/shared';
import { CHART_MARGIN, CHART_GRID_PROPS, DATE_TICK_FORMATTER } from './chartConstants.js';
import { ChartXAxis, ChartYAxis, ChartTooltip, ChartLegend } from './ChartAxis.js';
import ChartCard from '../ChartCard.js';
import {
  downsample,
  DOWNSAMPLE_THRESHOLD,
  DOWNSAMPLE_TARGET,
} from '../../hooks/useChartInteractions.js';

/** Telltale 走势对比图 Props */
interface TelltaleChartProps {
  /** 回测模式：组合结果列表 */
  portfolios?: PortfolioResult[];
  /** 分析模式：单资产分析结果 */
  results?: AssetAnalysisResult;
  /** 外层已提供 chart-card 标题时设为 true，避免重复标题与容器 */
  embedded?: boolean;
}

interface GrowthPoint {
  date: string;
  value: number;
}

interface NamedGrowth {
  name: string;
  growthCurve: GrowthPoint[];
}

/** 从基准+对比序列构建 telltale 比率数据 */
function buildTelltaleData(benchmark: NamedGrowth, comparisons: NamedGrowth[]) {
  const benchMap = new Map<string, number>();
  for (const point of benchmark.growthCurve) {
    benchMap.set(point.date, point.value);
  }
  const dateMap = new Map<string, Record<string, number | string>>();
  for (const item of comparisons) {
    for (const point of item.growthCurve) {
      const benchVal = benchMap.get(point.date);
      if (benchVal == null || benchVal === 0) continue;
      if (!dateMap.has(point.date)) dateMap.set(point.date, { date: point.date });
      dateMap.get(point.date)![item.name] = +(point.value / benchVal).toFixed(6);
    }
  }
  return Array.from(dateMap.values()).sort((a, b) =>
    (a.date as string).localeCompare(b.date as string),
  );
}

interface TelltaleDataResult {
  chartData: Array<Record<string, number | string>>;
  labels: string[];
  title: string;
  emptyMessage: string | null;
}

/** 计算图表数据/标签/标题/空提示（从组件抽出，纯函数便于测试） */
function computeTelltaleData(
  portfolios: PortfolioResult[] | undefined,
  results: AssetAnalysisResult | undefined,
  t: ReturnType<typeof useTranslation>['t'],
): TelltaleDataResult {
  if (results) {
    if (results.tickers.length < 2) {
      return {
        chartData: [],
        labels: [],
        title: t('analysis.telltaleChart'),
        emptyMessage: t('analysis.telltaleNeedTwo'),
      };
    }
    const benchmark = {
      name: results.tickers[0].ticker,
      growthCurve: results.tickers[0].growthCurve,
    };
    const comparisons = results.tickers
      .slice(1)
      .map((tk) => ({ name: tk.ticker, growthCurve: tk.growthCurve }));
    const labels = results.tickers.slice(1).map((tk) => tk.ticker);
    const merged = buildTelltaleData(benchmark, comparisons);
    return {
      chartData:
        merged.length > DOWNSAMPLE_THRESHOLD ? downsample(merged, DOWNSAMPLE_TARGET) : merged,
      labels,
      title: `${t('analysis.telltaleRelative')} ${results.tickers[0].ticker}`,
      emptyMessage: null,
    };
  }
  const pf = portfolios ?? [];
  if (pf.length < 2) {
    return {
      chartData: [],
      labels: [],
      title: t('analysis.telltaleChart'),
      emptyMessage: t('analysis.telltaleNeedTwo'),
    };
  }
  const merged = buildTelltaleData(pf[0], pf.slice(1));
  return {
    chartData:
      merged.length > DOWNSAMPLE_THRESHOLD ? downsample(merged, DOWNSAMPLE_TARGET) : merged,
    labels: pf.slice(1).map((p) => p.name),
    title: t('analysis.telltaleChart'),
    emptyMessage: null,
  };
}

/** Telltale 图表渲染（从主组件抽出，控制行数） */
function TelltaleChartView({
  chartData,
  labels,
  embedded,
  t,
}: {
  chartData: Array<Record<string, number | string>>;
  labels: string[];
  embedded: boolean;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <ResponsiveContainer width="100%" height={embedded ? 450 : 400}>
      <LineChart data={chartData} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <ChartXAxis />
        <ChartYAxis
          tickFormatter={(v: number) => v.toFixed(3)}
          label={t('analysis.relativeRatio')}
        />
        <ChartTooltip
          labelFormatter={(label: string) => `${t('common.date')}: ${label}`}
          formatter={(value: number) => [value.toFixed(3), '']}
        />
        <ChartLegend />
        <ReferenceLine y={1} stroke="var(--text-muted)" strokeDasharray="4 4" />
        {labels.map((label, idx) => (
          <Line
            key={label}
            type="monotone"
            dataKey={label}
            stroke={CHART_COLORS[(idx + 1) % CHART_COLORS.length]}
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

export default function TelltaleChart({
  portfolios,
  results,
  embedded = false,
}: TelltaleChartProps) {
  const { t } = useTranslation();

  const { chartData, labels, title, emptyMessage } = useMemo(
    () => computeTelltaleData(portfolios, results, t),
    [portfolios, results, t],
  );

  if (emptyMessage) {
    return (
      <ChartCard title={title}>
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '13px',
            padding: '40px 0',
            textAlign: 'center',
          }}
        >
          {emptyMessage}
        </div>
      </ChartCard>
    );
  }

  const chart = (
    <TelltaleChartView chartData={chartData} labels={labels} embedded={embedded} t={t} />
  );

  if (embedded) {
    return <ChartCard title={title}>{chart}</ChartCard>;
  }

  return (
    <ChartCard title={title} data={chartData} csvFilename="telltale">
      {chart}
    </ChartCard>
  );
}
