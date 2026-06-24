/**
 * @file 回撤片段表
 * @description 列出投资组合历史中的重大回撤事件，含起止日期、深度及恢复时长
 */
import { Fragment } from 'react';
import type { PortfolioResult, DrawdownEpisode } from '../../shared/types';
import { CHART_COLORS } from '../../shared/types';

/** 回撤片段表 Props */
interface DrawdownEpisodesProps {
  portfolios: PortfolioResult[];
}

/** 格式化日期字符串为简短格式 */
function fmtDate(d?: string): string {
  if (!d) return '—';
  return d;
}

/** 格式化年份，如 1.42y */
function fmtYears(v: number): string {
  return `${v.toFixed(2)}y`;
}

/** 格式化百分比（小数转百分比） */
function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

/** 格式化比率 */
function fmtRatio(v: number): string {
  return v.toFixed(2);
}

/** 计算一组数值的统计摘要 */
function calcStats(values: number[]): { min: number; median: number; avg: number; max: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min, median, avg, max };
}

/** 统计摘要行定义 */
interface SummaryField {
  key: keyof DrawdownEpisode;
  label: string;
  fmt: (v: number) => string;
}

const SUMMARY_FIELDS: SummaryField[] = [
  { key: 'depth', label: 'Depth', fmt: fmtPct },
  { key: 'timeToTrough', label: 'Time to Trough', fmt: fmtYears },
  { key: 'recoveryTime', label: 'Recovery Time', fmt: fmtYears },
  { key: 'totalTime', label: 'Total Time', fmt: fmtYears },
  { key: 'recoveryFactor', label: 'Recovery Factor', fmt: fmtRatio },
  { key: 'cagrDuring', label: 'CAGR During', fmt: fmtPct },
  { key: 'ulcerDuring', label: 'Ulcer During', fmt: fmtRatio },
];

export default function DrawdownEpisodes({ portfolios }: DrawdownEpisodesProps) {
  const portfoliosWithEpisodes = portfolios.filter(
    (p) => p.drawdownEpisodes && p.drawdownEpisodes.length > 0
  );

  if (portfoliosWithEpisodes.length === 0) {
    return (
      <div className="chart-card">
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>暂无回撤事件数据</div>
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
              <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                高点日期
              </th>
              <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                低点日期
              </th>
              <th className="text-[12px] font-semibold text-left py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                恢复日期
              </th>
              <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                深度
              </th>
              <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                到低点时间
              </th>
              <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                恢复时间
              </th>
              <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                总时间
              </th>
              <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                恢复因子
              </th>
              <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                期间CAGR
              </th>
              <th className="text-[12px] font-semibold text-right py-2.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                期间溃疡指数
              </th>
            </tr>
          </thead>
          <tbody>
            {portfoliosWithEpisodes.map((portfolio, pIdx) => {
              const color = CHART_COLORS[pIdx % CHART_COLORS.length];
              const episodes = portfolio.drawdownEpisodes!;
              const colSpan = 10;

              // 计算统计摘要
              const summaryStats = SUMMARY_FIELDS.map((field) => {
                const values = episodes.map((e) => e[field.key]).filter((v): v is number => v !== undefined && v !== null);
                const stats = calcStats(values);
                return { ...field, stats };
              });

              return (
                <Fragment key={portfolio.name}>
                  {/* 分组标题 */}
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

                  {/* 统计摘要 */}
                  {summaryStats.map((field, sIdx) => {
                    const isAlt = sIdx % 2 === 1;
                    return (
                      <tr key={`summary-${field.key}`} style={{ backgroundColor: isAlt ? 'var(--bg-subtle)' : 'transparent' }}>
                        <td
                          colSpan={3}
                          className="text-[12px] italic py-1.5 px-3"
                          style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-soft)' }}
                        >
                          {field.label}
                        </td>
                        {field.stats ? (
                          <>
                            <td className="text-[12px] text-right py-1.5 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                              最小: {field.fmt(field.stats.min)}
                            </td>
                            <td className="text-[12px] text-right py-1.5 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                              中位: {field.fmt(field.stats.median)}
                            </td>
                            <td className="text-[12px] text-right py-1.5 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                              均值: {field.fmt(field.stats.avg)}
                            </td>
                            <td className="text-[12px] text-right py-1.5 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                              最大: {field.fmt(field.stats.max)}
                            </td>
                            <td colSpan={3} className="text-[12px] py-1.5 px-3" style={{ borderBottom: '1px solid var(--border-soft)' }} />
                          </>
                        ) : (
                          <td colSpan={7} className="text-[12px] py-1.5 px-3" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-soft)' }}>
                            —
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {/* 回撤事件行 */}
                  {episodes.map((ep, epIdx) => {
                    const isAlt = epIdx % 2 === 1;
                    return (
                      <tr key={`${ep.peakDate}-${epIdx}`} style={{ backgroundColor: isAlt ? 'var(--bg-subtle)' : 'transparent' }}>
                        <td className="text-[13px] py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                          {fmtDate(ep.peakDate)}
                        </td>
                        <td className="text-[13px] py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                          {fmtDate(ep.troughDate)}
                        </td>
                        <td className="text-[13px] py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                          {fmtDate(ep.recoveryDate)}
                        </td>
                        <td className="text-[13px] text-right py-2 px-3 font-mono font-medium" style={{ color: 'var(--text-strong)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                          {fmtPct(ep.depth)}
                        </td>
                        <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                          {fmtYears(ep.timeToTrough)}
                        </td>
                        <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                          {ep.recoveryDate ? fmtYears(ep.recoveryTime) : '—'}
                        </td>
                        <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                          {ep.recoveryDate ? fmtYears(ep.totalTime) : '—'}
                        </td>
                        <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                          {ep.recoveryDate ? fmtRatio(ep.recoveryFactor) : '—'}
                        </td>
                        <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                          {fmtPct(ep.cagrDuring)}
                        </td>
                        <td className="text-[13px] text-right py-2 px-3 font-mono" style={{ color: 'var(--text-body)', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>
                          {fmtRatio(ep.ulcerDuring)}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

