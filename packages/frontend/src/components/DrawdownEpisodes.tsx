/**
 * @file 回撤片段表
 * @description 列出投资组合历史中的重大回撤事件，含起止日期、深度及恢复时长
 */
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioResult, DrawdownEpisode } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { fmtDate, fmtYears, fmtPct, fmtRatio } from '../utils/format.js';
import { mean } from '../utils/stats.js';
import ChartCard from './ChartCard.js';

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
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { min: sorted[0], median, avg: mean(values), max: sorted[sorted.length - 1] };
}

/** 表头 + 数据列定义 */
const HEADERS = [
  {
    label: 'components.drawdownEpisodes.headers.peakDate',
    align: 'left',
    key: 'peakDate' as const,
    fmt: (ep: DrawdownEpisode) => fmtDate(ep.peakDate),
  },
  {
    label: 'components.drawdownEpisodes.headers.troughDate',
    align: 'left',
    key: 'troughDate' as const,
    fmt: (ep: DrawdownEpisode) => fmtDate(ep.troughDate),
  },
  {
    label: 'components.drawdownEpisodes.headers.recoveryDate',
    align: 'left',
    key: 'recoveryDate' as const,
    fmt: (ep: DrawdownEpisode) => fmtDate(ep.recoveryDate),
  },
  {
    label: 'components.drawdownEpisodes.headers.depth',
    align: 'right',
    key: 'depth' as const,
    fmt: (ep: DrawdownEpisode) => fmtPct(ep.depth),
  },
  {
    label: 'components.drawdownEpisodes.headers.timeToTrough',
    align: 'right',
    key: 'timeToTrough' as const,
    fmt: (ep: DrawdownEpisode) => fmtYears(ep.timeToTrough),
  },
  {
    label: 'components.drawdownEpisodes.headers.recoveryTime',
    align: 'right',
    key: 'recoveryTime' as const,
    fmt: (ep: DrawdownEpisode) => (ep.recoveryDate ? fmtYears(ep.recoveryTime) : '—'),
  },
  {
    label: 'components.drawdownEpisodes.headers.totalTime',
    align: 'right',
    key: 'totalTime' as const,
    fmt: (ep: DrawdownEpisode) => (ep.recoveryDate ? fmtYears(ep.totalTime) : '—'),
  },
  {
    label: 'components.drawdownEpisodes.headers.recoveryFactor',
    align: 'right',
    key: 'recoveryFactor' as const,
    fmt: (ep: DrawdownEpisode) => (ep.recoveryDate ? fmtRatio(ep.recoveryFactor) : '—'),
  },
  {
    label: 'components.drawdownEpisodes.headers.cagrDuring',
    align: 'right',
    key: 'cagrDuring' as const,
    fmt: (ep: DrawdownEpisode) => fmtPct(ep.cagrDuring),
  },
  {
    label: 'components.drawdownEpisodes.headers.ulcerDuring',
    align: 'right',
    key: 'ulcerDuring' as const,
    fmt: (ep: DrawdownEpisode) => fmtRatio(ep.ulcerDuring),
  },
] as const;

const SUMMARY_FIELDS: Array<{
  key: keyof DrawdownEpisode;
  labelKey: string;
  fmt: (v: number) => string;
}> = [
  { key: 'depth', labelKey: 'components.drawdownEpisodes.summaryLabels.depth', fmt: fmtPct },
  {
    key: 'timeToTrough',
    labelKey: 'components.drawdownEpisodes.summaryLabels.timeToTrough',
    fmt: fmtYears,
  },
  {
    key: 'recoveryTime',
    labelKey: 'components.drawdownEpisodes.summaryLabels.recoveryTime',
    fmt: fmtYears,
  },
  {
    key: 'totalTime',
    labelKey: 'components.drawdownEpisodes.summaryLabels.totalTime',
    fmt: fmtYears,
  },
  {
    key: 'recoveryFactor',
    labelKey: 'components.drawdownEpisodes.summaryLabels.recoveryFactor',
    fmt: fmtRatio,
  },
  {
    key: 'cagrDuring',
    labelKey: 'components.drawdownEpisodes.summaryLabels.cagrDuring',
    fmt: fmtPct,
  },
  {
    key: 'ulcerDuring',
    labelKey: 'components.drawdownEpisodes.summaryLabels.ulcerDuring',
    fmt: fmtRatio,
  },
];

const STAT_KEYS = ['min', 'median', 'avg', 'max'] as const;

/** 统计摘要区块 */
function SummaryBlock({
  summaryStats,
}: {
  summaryStats: Array<{
    field: (typeof SUMMARY_FIELDS)[number];
    stats: ReturnType<typeof calcStats>;
  }>;
}) {
  const { t } = useTranslation();
  return (
    <tr>
      <td
        colSpan={10}
        className="py-2 px-3"
        style={{
          backgroundColor: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border-soft)',
        }}
      >
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
          {summaryStats.map(({ field, stats }) => (
            <div key={field.key} className="flex items-baseline gap-1.5">
              <span style={{ color: 'var(--text-muted)' }}>{t(field.labelKey)}:</span>
              {stats ? (
                <span className="font-mono" style={{ color: 'var(--text-body)' }}>
                  {STAT_KEYS.map((statKey) => (
                    <span key={statKey} className="mr-1.5">
                      <span style={{ color: 'var(--text-muted)' }}>
                        {t(`components.drawdownEpisodes.statLabels.${statKey}`)}
                      </span>
                      <span className="ml-0.5">{field.fmt(stats[statKey])}</span>
                    </span>
                  ))}
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>—</span>
              )}
            </div>
          ))}
        </div>
      </td>
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

  const summaryStats = SUMMARY_FIELDS.map((field) => {
    const values = episodes.map((e) => e[field.key]).filter((v): v is number => v != null);
    return { field, stats: calcStats(values) };
  });

  return (
    <Fragment key={portfolio.name}>
      <tr style={{ backgroundColor: 'var(--bg-strong)' }}>
        <td
          colSpan={10}
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
      <SummaryBlock summaryStats={summaryStats} />
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
  const { t } = useTranslation();
  const portfoliosWithEpisodes = portfolios.filter(
    (p) => p.drawdownEpisodes && p.drawdownEpisodes.length > 0,
  );

  if (portfoliosWithEpisodes.length === 0) {
    return (
      <ChartCard>
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {t('components.drawdownEpisodes.noData')}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={t('components.drawdownEpisodes.title')}>
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
                  {t(h.label)}
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
    </ChartCard>
  );
}
