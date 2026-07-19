/**
 * @file 信号页面公共结果面板组件
 * @description 抽取 SignalAnalyzerPage/DualSignalPage/MultiSignalPage 共用的结果展示组件：
 * 空状态提示、错误提示、结果容器、权益曲线图。各页面结果内容差异较大
 * （单/多信号、统计表/对比表/贡献度表），故仅抽取共性外壳与权益曲线图。
 */
import type { ReactNode } from 'react';
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
  ReferenceLine,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import {
  CHART_TOOLTIP_STYLE,
  CHART_MARGIN,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
  LEGEND_WRAPPER_STYLE,
  DATE_TICK_FORMATTER,
} from '@/components/charts/chartConstants.js';

/** 空结果提示 Props */
interface EmptyResultsHintProps {
  /** 提示文本，未传则使用 i18n 默认值 */
  text?: string;
}

/**
 * 空结果提示
 *
 * 在 results 为 null 且无错误且非加载中时显示的占位卡片。
 */
export function EmptyResultsHint({ text }: EmptyResultsHintProps) {
  const { t } = useTranslation();
  return (
    <div
      className="card"
      style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
    >
      {text ?? t('signal.common.emptyHint')}
    </div>
  );
}

/** 错误提示 Props */
interface AnalysisErrorAlertProps {
  /** 错误信息 */
  error: string | null;
  /** 错误前缀文本，未传则使用 i18n 默认值 */
  prefix?: string;
}

/**
 * 分析失败错误提示
 *
 * 当 error 非空时渲染红色错误卡片。
 */
export function AnalysisErrorAlert({ error, prefix }: AnalysisErrorAlertProps) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <div className="card" style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
      {prefix ?? t('signal.common.analysisFailedPrefix')}
      {error}
    </div>
  );
}

/** 结果容器 Props */
interface ResultsContainerProps {
  children: ReactNode;
}

/**
 * 结果区垂直间距容器
 *
 * 三个信号页面都用 `<div className="space-y-4">` 包裹错误/结果/空状态。
 */
export function ResultsContainer({ children }: ResultsContainerProps) {
  return <div className="space-y-4">{children}</div>;
}

/** 权益曲线单系列配置 */
interface EquitySeriesConfig {
  /** 数据字段名（同时作为 dataKey） */
  dataKey: string;
  /** Legend 显示名，默认等于 dataKey */
  legendName?: string;
  /** 折线宽度，未传则用 defaultStrokeWidth */
  strokeWidth?: number;
}

/** 权益曲线图 Props */
interface EquityLineChartProps {
  /** 图表数据，键包含 date 与各系列 dataKey */
  data: Array<Record<string, number | string>>;
  /** 系列；可传字符串数组（仅 dataKey）或完整配置数组 */
  series: EquitySeriesConfig[] | string[];
  /** Tooltip 中显示的名称（formatter 第二个返回值），多系列时通常传 ''；未传则使用 i18n 默认值 */
  tooltipName?: string;
  /** Tooltip 标签前缀；未传则使用 i18n 默认的"日期: {date}"格式 */
  tooltipLabelPrefix?: string;
  /** Y 轴基线参考线值（如 10000），undefined 表示不显示 */
  referenceY?: number;
  /** 图表高度，默认 350 */
  height?: number;
  /** 默认折线宽度，默认 2 */
  defaultStrokeWidth?: number;
}

function normalizeSeries(
  series: EquitySeriesConfig[] | string[],
  defaultStrokeWidth: number,
): Required<EquitySeriesConfig>[] {
  return series.map((s) => {
    const cfg = typeof s === 'string' ? { dataKey: s } : s;
    return {
      dataKey: cfg.dataKey,
      legendName: cfg.legendName ?? cfg.dataKey,
      strokeWidth: cfg.strokeWidth ?? defaultStrokeWidth,
    };
  });
}

/**
 * 信号页面通用权益曲线图
 *
 * 复用于单信号（单系列）、双信号对比（三系列）、多信号聚合（单系列）。
 * 内部使用统一的 chartConstants 样式，与 GrowthChartContent 风格一致。
 */
export function EquityLineChart({
  data,
  series,
  tooltipName,
  tooltipLabelPrefix,
  referenceY = 10000,
  height = 350,
  defaultStrokeWidth = 2,
}: EquityLineChartProps) {
  const { t } = useTranslation();
  const resolvedTooltipName = tooltipName ?? t('signal.common.equity');
  const normalized = normalizeSeries(series, defaultStrokeWidth);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--bg-subtle)" />
        <XAxis dataKey="date" tick={AXIS_TICK_STYLE} tickFormatter={DATE_TICK_FORMATTER} />
        <YAxis
          tick={AXIS_TICK_STYLE}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          labelFormatter={(label: string) =>
            tooltipLabelPrefix !== undefined
              ? `${tooltipLabelPrefix}${label}`
              : t('signal.common.dateLabel', { date: label })
          }
          formatter={(value: number) => [`$${value.toLocaleString()}`, resolvedTooltipName]}
        />
        <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
        {referenceY !== undefined && (
          <ReferenceLine y={referenceY} stroke="var(--text-muted)" strokeDasharray="4 4" />
        )}
        {normalized.map((s, idx) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.legendName}
            stroke={CHART_COLORS[idx % CHART_COLORS.length]}
            strokeWidth={s.strokeWidth}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
