/**
 * @file 统计指标表格
 * @description 展示各投资组合的核心统计指标对比，支持完整与概览两种模式
 */
import { Fragment } from 'react';
import type { PortfolioResult, Statistics } from '@backtest/shared/types';
import { CHART_COLORS } from '@backtest/shared/types';

/** 统计指标表格 Props */
interface StatisticsTableProps {
  portfolios: PortfolioResult[];
  /** 概览模式：只显示核心指标 */
  compact?: boolean;
}

type FmtType = 'pct' | 'ratio' | 'duration';

interface StatRow {
  key: keyof Statistics;
  label: string;
  fmt: FmtType;
}

interface StatGroup {
  title: string;
  rows: StatRow[];
}

const STAT_GROUPS: StatGroup[] = [
  {
    title: '收益指标',
    rows: [
      { key: 'cagr', label: '年化收益率 (CAGR)', fmt: 'pct' },
      { key: 'avgAnnualReturn', label: '年均收益', fmt: 'pct' },
      { key: 'avgMonthlyReturn', label: '月均收益', fmt: 'pct' },
      { key: 'avgDailyReturn', label: '日均收益', fmt: 'pct' },
      { key: 'bestYear', label: '最佳年度', fmt: 'pct' },
      { key: 'worstYear', label: '最差年度', fmt: 'pct' },
    ],
  },
  {
    title: '波动率',
    rows: [
      { key: 'stdev', label: '年收益标准差 (年化)', fmt: 'pct' },
      { key: 'stdevAnnual', label: '年收益标准差', fmt: 'pct' },
      { key: 'stdevMonthly', label: '月收益标准差 (年化)', fmt: 'pct' },
      { key: 'stdevMonthlyRaw', label: '月收益标准差', fmt: 'pct' },
      { key: 'stdevDaily', label: '日收益标准差 (年化)', fmt: 'pct' },
      { key: 'stdevDailyRaw', label: '日收益标准差', fmt: 'pct' },
    ],
  },
  {
    title: '下行偏差',
    rows: [
      { key: 'downsideDeviation', label: '日收益下行偏差 (年化)', fmt: 'pct' },
      { key: 'downsideDeviationDailyRaw', label: '日收益下行偏差', fmt: 'pct' },
      { key: 'downsideDeviationMonthly', label: '月收益下行偏差 (年化)', fmt: 'pct' },
      { key: 'downsideDeviationMonthlyRaw', label: '月收益下行偏差', fmt: 'pct' },
      { key: 'downsideDeviationAnnual', label: '年收益下行偏差', fmt: 'pct' },
    ],
  },
  {
    title: '回撤',
    rows: [
      { key: 'maxDrawdown', label: '最大回撤', fmt: 'pct' },
      { key: 'avgDrawdown', label: '平均回撤', fmt: 'pct' },
      { key: 'maxDrawdownDuration', label: '最长回撤持续', fmt: 'duration' },
      { key: 'drawdownRecoveryFactor', label: '回撤恢复因子', fmt: 'ratio' },
      { key: 'ulcerIndex', label: '溃疡指数', fmt: 'ratio' },
    ],
  },
  {
    title: '风险调整指标',
    rows: [
      { key: 'sharpe', label: '夏普比率', fmt: 'ratio' },
      { key: 'sortino', label: '索提诺比率', fmt: 'ratio' },
      { key: 'calmar', label: '卡尔玛比率', fmt: 'ratio' },
      { key: 'm2', label: 'M\u00B2 指标 (莫迪利亚尼)', fmt: 'pct' },
      { key: 'ulcerPerformanceIndex', label: '溃疡绩效指数 (UPI)', fmt: 'ratio' },
      { key: 'diversificationRatio', label: '分散化比率', fmt: 'ratio' },
    ],
  },
  {
    title: '基准相关',
    rows: [
      { key: 'benchmarkCorrelation', label: '基准相关性', fmt: 'ratio' },
      { key: 'beta', label: 'Beta', fmt: 'ratio' },
      { key: 'upsideCorrelation', label: '上行相关性', fmt: 'ratio' },
      { key: 'downsideCorrelation', label: '下行相关性', fmt: 'ratio' },
      { key: 'upsideBeta', label: '上行 Beta', fmt: 'ratio' },
      { key: 'downsideBeta', label: '下行 Beta', fmt: 'ratio' },
      { key: 'alphaDaily', label: 'Alpha (日度)', fmt: 'pct' },
      { key: 'alphaAnnualized', label: 'Alpha (年化)', fmt: 'pct' },
      { key: 'alpha', label: 'Alpha (Jensen)', fmt: 'pct' },
      { key: 'rSquared', label: 'R\u00B2', fmt: 'ratio' },
      { key: 'treynor', label: '特雷诺比率', fmt: 'ratio' },
    ],
  },
  {
    title: '捕获率',
    rows: [
      { key: 'upsideCapture', label: '上行捕获率 (月度)', fmt: 'pct' },
      { key: 'downsideCapture', label: '下行捕获率 (月度)', fmt: 'pct' },
      { key: 'captureSpread', label: '捕获差 (月度)', fmt: 'pct' },
      { key: 'upsideCaptureDaily', label: '上行捕获率 (日度)', fmt: 'pct' },
      { key: 'downsideCaptureDaily', label: '下行捕获率 (日度)', fmt: 'pct' },
      { key: 'captureSpreadDaily', label: '捕获差 (日度)', fmt: 'pct' },
      { key: 'upsideCaptureAnnual', label: '上行捕获率 (年度)', fmt: 'pct' },
      { key: 'downsideCaptureAnnual', label: '下行捕获率 (年度)', fmt: 'pct' },
      { key: 'captureSpreadAnnual', label: '捕获差 (年度)', fmt: 'pct' },
    ],
  },
  {
    title: '主动管理',
    rows: [
      { key: 'activeReturn', label: '主动收益', fmt: 'pct' },
      { key: 'trackingError', label: '跟踪误差', fmt: 'pct' },
      { key: 'informationRatio', label: '信息比率', fmt: 'ratio' },
    ],
  },
  {
    title: '风险价值 (VaR/CVaR)',
    rows: [
      { key: 'varDaily1', label: '日收益 VaR (1%)', fmt: 'pct' },
      { key: 'varDaily5', label: '日收益 VaR (5%)', fmt: 'pct' },
      { key: 'varDaily10', label: '日收益 VaR (10%)', fmt: 'pct' },
      { key: 'cvarDaily1', label: '日收益 CVaR (1%)', fmt: 'pct' },
      { key: 'cvarDaily5', label: '日收益 CVaR (5%)', fmt: 'pct' },
      { key: 'cvarDaily10', label: '日收益 CVaR (10%)', fmt: 'pct' },
      { key: 'varMonthly1', label: '月收益 VaR (1%)', fmt: 'pct' },
      { key: 'varMonthly5', label: '月收益 VaR (5%)', fmt: 'pct' },
      { key: 'varMonthly10', label: '月收益 VaR (10%)', fmt: 'pct' },
      { key: 'cvarMonthly1', label: '月收益 CVaR (1%)', fmt: 'pct' },
      { key: 'cvarMonthly5', label: '月收益 CVaR (5%)', fmt: 'pct' },
      { key: 'cvarMonthly10', label: '月收益 CVaR (10%)', fmt: 'pct' },
      { key: 'varAnnual1', label: '年收益 VaR (1%)', fmt: 'pct' },
      { key: 'varAnnual5', label: '年收益 VaR (5%)', fmt: 'pct' },
      { key: 'varAnnual10', label: '年收益 VaR (10%)', fmt: 'pct' },
      { key: 'cvarAnnual1', label: '年收益 CVaR (1%)', fmt: 'pct' },
      { key: 'cvarAnnual5', label: '年收益 CVaR (5%)', fmt: 'pct' },
      { key: 'cvarAnnual10', label: '年收益 CVaR (10%)', fmt: 'pct' },
    ],
  },
  {
    title: '分布特征',
    rows: [
      { key: 'skewnessDaily', label: '日收益偏度', fmt: 'ratio' },
      { key: 'skewnessMonthly', label: '月收益偏度', fmt: 'ratio' },
      { key: 'skewnessAnnual', label: '年收益偏度', fmt: 'ratio' },
      { key: 'excessKurtosisDaily', label: '日收益超额峰度', fmt: 'ratio' },
      { key: 'excessKurtosisMonthly', label: '月收益超额峰度', fmt: 'ratio' },
      { key: 'excessKurtosisAnnual', label: '年收益超额峰度', fmt: 'ratio' },
    ],
  },
  {
    title: '正收益比例',
    rows: [
      { key: 'pctPositiveDays', label: '正收益日占比', fmt: 'pct' },
      { key: 'pctPositiveMonths', label: '正收益月占比', fmt: 'pct' },
      { key: 'pctPositiveYears', label: '正收益年占比', fmt: 'pct' },
    ],
  },
  {
    title: '极值收益',
    rows: [
      { key: 'maxDailyReturn', label: '最大日收益', fmt: 'pct' },
      { key: 'minDailyReturn', label: '最小日收益', fmt: 'pct' },
      { key: 'maxMonthlyReturn', label: '最大月收益', fmt: 'pct' },
      { key: 'minMonthlyReturn', label: '最小月收益', fmt: 'pct' },
      { key: 'maxAnnualReturn', label: '最大年收益', fmt: 'pct' },
      { key: 'minAnnualReturn', label: '最小年收益', fmt: 'pct' },
    ],
  },
  {
    title: '平均盈亏',
    rows: [
      { key: 'avgDailyGain', label: '日均盈利', fmt: 'pct' },
      { key: 'avgDailyLoss', label: '日均亏损', fmt: 'pct' },
      { key: 'gainLossRatioDaily', label: '盈亏比 (日度)', fmt: 'ratio' },
      { key: 'avgMonthlyGain', label: '月均盈利', fmt: 'pct' },
      { key: 'avgMonthlyLoss', label: '月均亏损', fmt: 'pct' },
      { key: 'gainLossRatioMonthly', label: '盈亏比 (月度)', fmt: 'ratio' },
      { key: 'avgAnnualGain', label: '年均盈利', fmt: 'pct' },
      { key: 'avgAnnualLoss', label: '年均亏损', fmt: 'pct' },
      { key: 'gainLossRatioAnnual', label: '盈亏比 (年度)', fmt: 'ratio' },
    ],
  },
  {
    title: '提款率',
    rows: [
      { key: 'swr10y', label: '10年安全提款率', fmt: 'pct' },
      { key: 'pwr10y', label: '10年永续提款率', fmt: 'pct' },
      { key: 'swr20y', label: '20年安全提款率', fmt: 'pct' },
      { key: 'pwr20y', label: '20年永续提款率', fmt: 'pct' },
      { key: 'swr30y', label: '30年安全提款率', fmt: 'pct' },
      { key: 'pwr30y', label: '30年永续提款率', fmt: 'pct' },
      { key: 'swr40y', label: '40年安全提款率', fmt: 'pct' },
      { key: 'pwr40y', label: '40年永续提款率', fmt: 'pct' },
    ],
  },
];

/** 概览模式：只显示核心指标 */
const COMPACT_GROUPS: StatGroup[] = [
  {
    title: '核心指标',
    rows: [
      { key: 'cagr', label: '年化收益率 (CAGR)', fmt: 'pct' },
      { key: 'stdev', label: '年化波动率', fmt: 'pct' },
      { key: 'sharpe', label: '夏普比率', fmt: 'ratio' },
      { key: 'sortino', label: '索提诺比率', fmt: 'ratio' },
      { key: 'maxDrawdown', label: '最大回撤', fmt: 'pct' },
      { key: 'avgDrawdown', label: '平均回撤', fmt: 'pct' },
      { key: 'maxDrawdownDuration', label: '最长回撤持续', fmt: 'duration' },
      { key: 'calmar', label: '卡尔玛比率', fmt: 'ratio' },
      { key: 'ulcerIndex', label: '溃疡指数', fmt: 'ratio' },
      { key: 'diversificationRatio', label: '分散化比率', fmt: 'ratio' },
      { key: 'pctPositiveYears', label: '正收益年占比', fmt: 'pct' },
      { key: 'bestYear', label: '最佳年度', fmt: 'pct' },
      { key: 'worstYear', label: '最差年度', fmt: 'pct' },
    ],
  },
];

function formatValue(v: number | undefined, fmt: FmtType): string {
  if (v == null) return '—';
  if (fmt === 'pct') return `${(v * 100).toFixed(2)}%`;
  if (fmt === 'ratio') return v.toFixed(2);
  if (fmt === 'duration') return `${v} mo`;
  return v.toString();
}

/** 统计表表头 */
function StatisticsTableHeader({ portfolios }: { portfolios: PortfolioResult[] }) {
  return (
    <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
      <th
        className="text-[12px] font-semibold text-left py-2.5 px-3"
        style={{
          color: 'var(--text-muted)',
          borderBottom: '2px solid var(--border-soft)',
          minWidth: '320px',
        }}
      >
        指标
      </th>
      {portfolios.map((p, idx) => (
        <th
          key={p.name}
          className="text-[12px] font-semibold text-right py-2.5 px-3"
          style={{
            color: 'var(--text-muted)',
            borderBottom: '2px solid var(--border-soft)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
          />
          {p.name}
        </th>
      ))}
    </tr>
  );
}

/** 统计表分组行 */
function StatisticsGroupRows({
  group,
  portfolios,
  colCount,
}: {
  group: (typeof STAT_GROUPS)[number];
  portfolios: PortfolioResult[];
  colCount: number;
}) {
  let rowIdx = 0;
  return (
    <Fragment key={group.title}>
      <tr style={{ backgroundColor: 'var(--bg-strong)' }}>
        <td
          colSpan={colCount}
          className="text-[12px] font-bold py-2 px-3"
          style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}
        >
          {group.title}
        </td>
      </tr>
      {group.rows.map((row) => {
        const hasAnyValue = portfolios.some(
          (p) => p.statistics[row.key] !== undefined && p.statistics[row.key] !== null,
        );
        if (!hasAnyValue) return null;
        const isAlt = rowIdx % 2 === 1;
        rowIdx++;
        return (
          <tr key={row.key} style={{ backgroundColor: isAlt ? 'var(--bg-subtle)' : 'transparent' }}>
            <td
              className="text-[13px] py-2 px-3"
              style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)' }}
            >
              {row.label}
            </td>
            {portfolios.map((p) => {
              const val = p.statistics[row.key];
              return (
                <td
                  key={p.name}
                  className="text-[13px] font-medium text-right py-2 px-3 font-mono"
                  style={{
                    color: 'var(--text-strong)',
                    borderBottom: '1px solid var(--border-soft)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatValue(val, row.fmt)}
                </td>
              );
            })}
          </tr>
        );
      })}
    </Fragment>
  );
}

export default function StatisticsTable({ portfolios, compact }: StatisticsTableProps) {
  if (portfolios.length === 0) {
    return (
      <div className="chart-card">
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          暂无统计数据
        </div>
      </div>
    );
  }

  const groups = compact ? COMPACT_GROUPS : STAT_GROUPS;
  const colCount = 1 + portfolios.length;

  return (
    <div className="chart-card">
      <div className="chart-card-title">风险与收益指标</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <StatisticsTableHeader portfolios={portfolios} />
          </thead>
          <tbody>
            {groups.map((group) => (
              <StatisticsGroupRows
                key={group.title}
                group={group}
                portfolios={portfolios}
                colCount={colCount}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
