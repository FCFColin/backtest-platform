/**
 * @file 回撤片段表
 * @description 列出投资组合历史中的重大回撤事件，含起止日期、深度及恢复时长
 */
import { Fragment } from 'react';
import type { PortfolioResult, DrawdownEpisode } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { fmtDate, fmtYears, fmtPct, fmtRatio } from '../utils/format';

/** 回撤片段表 Props */
interface DrawdownEpisodesProps {
  portfolios: PortfolioResult[];
}

/** 计算一组数值的统计摘要 */
function calcStats(
  values: number[],
): { min: number; median: number; avg: number; max: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min, median, avg, max };
}

/** 表头 + 数据列定义 */
const HEADERS = [
  {
    label: '高点日期',
    align: 'left',
    key: 'peakDate' as const,
    fmt: (ep: DrawdownEpisode) => fmtDate(ep.peakDate),
  },
  {
    label: '低点日期',
    align: 'left',
    key: 'troughDate' as const,
    fmt: (ep: DrawdownEpisode) => fmtDate(ep.troughDate),
  },
  {
    label: '恢复日期',
    align: 'left',
    key: 'recoveryDate' as const,
    fmt: (ep: DrawdownEpisode) => fmtDate(ep.recoveryDate),
  },
  {
    label: '深度',
    align: 'right',
    key: 'depth' as const,
    fmt: (ep: DrawdownEpisode) => fmtPct(ep.depth),
  },
  {
    label: '到低点时间',
    align: 'right',
    key: 'timeToTrough' as const,
    fmt: (ep: DrawdownEpisode) => fmtYears(ep.timeToTrough),
  },
  {
    label: '恢复时间',
    align: 'right',
    key: 'recoveryTime' as const,
    fmt: (ep: DrawdownEpisode) => (ep.recoveryDate ? fmtYears(ep.recoveryTime) : '—'),
  },
  {
    label: '总时间',
    align: 'right',
    key: 'totalTime' as const,
    fmt: (ep: DrawdownEpisode) => (ep.recoveryDate ? fmtYears(ep.totalTime) : '—'),
  },
  {
    label: '恢复因子',
    align: 'right',
    key: 'recoveryFactor' as const,
    fmt: (ep: DrawdownEpisode) => (ep.recoveryDate ? fmtRatio(ep.recoveryFactor) : '—'),
  },
  {
    label: '期间CAGR',
    align: 'right',
    key: 'cagrDuring' as const,
    fmt: (ep: DrawdownEpisode) => fmtPct(ep.cagrDuring),
  },
  {
    label: '期间溃疡指数',
    align: 'right',
    key: 'ulcerDuring' as const,
    fmt: (ep: DrawdownEpisode) => fmtRatio(ep.ulcerDuring),
  },
] as const;

const SUMMARY_FIELDS: Array<{
  key: keyof DrawdownEpisode;
  label: string;
  fmt: (v: number) => string;
}> = [
  { key: 'depth', label: 'Depth', fmt: fmtPct },
  { key: 'timeToTrough', label: 'Time to Trough', fmt: fmtYears },
  { key: 'recoveryTime', label: 'Recovery Time', fmt: fmtYears },
  { key: 'totalTime', label: 'Total Time', fmt: fmtYears },
  { key: 'recoveryFactor', label: 'Recovery Factor', fmt: fmtRatio },
  { key: 'cagrDuring', label: 'CAGR During', fmt: fmtPct },
  { key: 'ulcerDuring', label: 'Ulcer During', fmt: fmtRatio },
];

const STAT_LABELS = ['最小', '中位', '均值', '最大'] as const;
const STAT_KEYS = ['min', 'median', 'avg', 'max'] as const;

/** 统计摘要行 */
function SummaryRow({
  field,
  stats,
}: {
  field: (typeof SUMMARY_FIELDS)[number];
  stats: ReturnType<typeof calcStats>;
}) {
  return (
    <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
      <td
        colSpan={3}
        className="text-[12px] italic py-1.5 px-3"
        style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-soft)' }}
      >
        {field.label}
      </td>
      {stats ? (
        <>
          {STAT_LABELS.map((label, si) => (
            <td
              key={label}
              className="text-[12px] text-right py-1.5 px-3 font-mono"
              style={{
                color: 'var(--text-body)',
                borderBottom: '1px solid var(--border-soft)',
                whiteSpace: 'nowrap',
              }}
            >
              {label}: {field.fmt(stats[STAT_KEYS[si]])}
            </td>
          ))}
          <td
            colSpan={3}
            className="text-[12px] py-1.5 px-3"
            style={{ borderBottom: '1px solid var(--border-soft)' }}
          />
        </>
      ) : (
        <td
          colSpan={7}
          className="text-[12px] py-1.5 px-3"
          style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-soft)' }}
        >
          —
        </td>
      )}
    </tr>
  );
}

/** 单个组合的回撤事件分组 */
function PortfolioDrawdownGroup({
  portfolio,
  colorIndex,
}: {
  portfolio: PortfolioResult;
  colorIndex: number;
}) {
  const color = CHART_COLORS[colorIndex % CHART_COLORS.length];
  const episodes = portfolio.drawdownEpisodes!;
  const colSpan = 10;

  const summaryStats = SUMMARY_FIELDS.map((field) => {
    const values = episodes.map((e) => e[field.key]).filter((v): v is number => v != null);
    return { ...field, stats: calcStats(values) };
  });

  return (
    <Fragment key={portfolio.name}>
      <tr style={{ backgroundColor: 'var(--bg-strong)' }}>
        <td
          colSpan={colSpan}
          className="text-[12px] font-bold py-2 px-3"
          style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)' }}
        >
          <span
            className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
            style={{ backgroundColor: color }}
          />
          {portfolio.name}
        </td>
      </tr>
      {summaryStats.map((field) => (
        <SummaryRow key={`summary-${field.key}`} field={field} stats={field.stats} />
      ))}
      {episodes.map((ep, epIdx) => (
        <tr
          key={`${ep.peakDate}-${epIdx}`}
          style={{ backgroundColor: epIdx % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }}
        >
          {HEADERS.map((h) => {
            const isDepth = h.key === 'depth';
            return (
              <td
                key={h.key}
                className={`text-[13px] text-${h.align} py-2 px-3 font-mono${isDepth ? ' font-medium' : ''}`}
                style={{
                  color: isDepth ? 'var(--text-strong)' : 'var(--text-body)',
                  borderBottom: '1px solid var(--border-soft)',
                  whiteSpace: 'nowrap',
                }}
              >
                {h.fmt(ep)}
              </td>
            );
          })}
        </tr>
      ))}
    </Fragment>
  );
}

export default function DrawdownEpisodes({ portfolios }: DrawdownEpisodesProps) {
  const portfoliosWithEpisodes = portfolios.filter(
    (p) => p.drawdownEpisodes && p.drawdownEpisodes.length > 0,
  );

  if (portfoliosWithEpisodes.length === 0) {
    return (
      <div className="chart-card">
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          暂无回撤事件数据
        </div>
      </div>
    );
  }

  return (
    <div className="chart-card">
      <div className="chart-card-title">回撤事件 (≥5%)</div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
              {HEADERS.map((h) => (
                <th
                  key={h.key}
                  className={`text-[12px] font-semibold text-${h.align} py-2.5 px-3`}
                  style={{
                    color: 'var(--text-muted)',
                    borderBottom: '2px solid var(--border-soft)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {portfoliosWithEpisodes.map((portfolio, pIdx) => (
              <PortfolioDrawdownGroup
                key={portfolio.name}
                portfolio={portfolio}
                colorIndex={pIdx}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
