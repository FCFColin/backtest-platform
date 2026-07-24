/**
 * @file 回撤片段表
 * @description 列出投资组合历史中的重大回撤事件，含起止日期、深度及恢复时长。
 *   基于 shadcn Card（经 ChartCard）+ token 化表格样式。
 */
import { useTranslation } from 'react-i18next';
import type { PortfolioResult, DrawdownEpisode } from '@backtest/shared';
import { CHART_COLORS } from '@backtest/shared';
import { fmtDate, fmtYears, fmtPct, fmtRatio } from '../utils/format.js';
import { mean } from '../utils/stats.js';
import ChartCard from './ChartCard.js';
import { cn } from '@/lib/utils';

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
    align: 'left' as const,
    key: 'peakDate' as const,
    fmt: (ep: DrawdownEpisode) => fmtDate(ep.peakDate),
  },
  {
    label: 'components.drawdownEpisodes.headers.troughDate',
    align: 'left' as const,
    key: 'troughDate' as const,
    fmt: (ep: DrawdownEpisode) => fmtDate(ep.troughDate),
  },
  {
    label: 'components.drawdownEpisodes.headers.recoveryDate',
    align: 'left' as const,
    key: 'recoveryDate' as const,
    fmt: (ep: DrawdownEpisode) => fmtDate(ep.recoveryDate),
  },
  {
    label: 'components.drawdownEpisodes.headers.depth',
    align: 'right' as const,
    key: 'depth' as const,
    fmt: (ep: DrawdownEpisode) => fmtPct(ep.depth),
  },
  {
    label: 'components.drawdownEpisodes.headers.timeToTrough',
    align: 'right' as const,
    key: 'timeToTrough' as const,
    fmt: (ep: DrawdownEpisode) => fmtYears(ep.timeToTrough),
  },
  {
    label: 'components.drawdownEpisodes.headers.recoveryTime',
    align: 'right' as const,
    key: 'recoveryTime' as const,
    fmt: (ep: DrawdownEpisode) => (ep.recoveryDate ? fmtYears(ep.recoveryTime) : '—'),
  },
  {
    label: 'components.drawdownEpisodes.headers.totalTime',
    align: 'right' as const,
    key: 'totalTime' as const,
    fmt: (ep: DrawdownEpisode) => (ep.recoveryDate ? fmtYears(ep.totalTime) : '—'),
  },
  {
    label: 'components.drawdownEpisodes.headers.recoveryFactor',
    align: 'right' as const,
    key: 'recoveryFactor' as const,
    fmt: (ep: DrawdownEpisode) => (ep.recoveryDate ? fmtRatio(ep.recoveryFactor) : '—'),
  },
  {
    label: 'components.drawdownEpisodes.headers.cagrDuring',
    align: 'right' as const,
    key: 'cagrDuring' as const,
    fmt: (ep: DrawdownEpisode) => fmtPct(ep.cagrDuring),
  },
  {
    label: 'components.drawdownEpisodes.headers.ulcerDuring',
    align: 'right' as const,
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

/** 表头单元格 className（按对齐方向） */
const TH_ALIGN: Record<'left' | 'right', string> = {
  left: 'text-left',
  right: 'text-right',
};

/** 数据单元格 className（按对齐方向） */
const TD_ALIGN: Record<'left' | 'right', string> = {
  left: 'text-left',
  right: 'text-right',
};

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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {summaryStats.map(({ field, stats }) => {
        const isDepth = field.key === 'depth';
        return (
          <div key={field.key} className="min-w-0">
            <div className="text-caption text-fg-tertiary">{t(field.labelKey)}</div>
            {stats ? (
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                {STAT_KEYS.map((statKey) => (
                  <div key={statKey} className="flex items-baseline gap-1">
                    <span className="text-caption text-fg-tertiary">
                      {t(`components.drawdownEpisodes.statLabels.${statKey}`)}
                    </span>
                    <span
                      className={cn(
                        'font-mono tabular-nums text-body',
                        isDepth ? 'font-semibold text-danger' : 'text-fg',
                      )}
                    >
                      {field.fmt(stats[statKey])}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-fg-tertiary">—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 单个组合的回撤事件分组（独立块结构） */
function PortfolioDrawdownGroup({
  portfolio,
  colorIndex,
}: {
  portfolio: PortfolioResult;
  colorIndex: number;
}) {
  const { t } = useTranslation();
  const color = CHART_COLORS[colorIndex % CHART_COLORS.length];
  const episodes = portfolio.drawdownEpisodes!;

  const summaryStats = SUMMARY_FIELDS.map((field) => {
    const values = episodes.map((e) => e[field.key]).filter((v): v is number => v != null);
    return { field, stats: calcStats(values) };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-h3 font-semibold text-fg">{portfolio.name}</span>
      </div>

      <SummaryBlock summaryStats={summaryStats} />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-body">
          <thead>
            <tr className="bg-elevated">
              {HEADERS.map((h) => (
                <th
                  key={h.key}
                  className={cn(
                    'py-2.5 px-3 text-caption font-semibold uppercase tracking-wide text-fg-tertiary',
                    'border-b border-border-subtle whitespace-nowrap',
                    TH_ALIGN[h.align],
                  )}
                >
                  {t(h.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {episodes.map((ep, epIdx) => (
              <tr key={`${ep.peakDate}-${epIdx}`} className={epIdx % 2 === 1 ? 'bg-elevated' : 'bg-transparent'}>
                {HEADERS.map((h) => {
                  const isDepth = h.key === 'depth';
                  return (
                    <td
                      key={h.key}
                      className={cn(
                        'py-2 px-3 font-mono tabular-nums border-b border-border-subtle whitespace-nowrap',
                        isDepth ? 'font-semibold text-fg' : 'text-fg-secondary',
                        TD_ALIGN[h.align],
                      )}
                    >
                      {h.fmt(ep)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * 回撤片段表组件。
 * @param props - portfolios: 投资组合列表
 * @returns 渲染的回撤片段表（每个组合一个分组，含统计摘要 + 事件表）
 */
export default function DrawdownEpisodes({ portfolios }: DrawdownEpisodesProps) {
  const { t } = useTranslation();
  const portfoliosWithEpisodes = portfolios.filter(
    (p) => p.drawdownEpisodes && p.drawdownEpisodes.length > 0,
  );

  if (portfoliosWithEpisodes.length === 0) {
    return (
      <ChartCard>
        <div className="text-body text-fg-tertiary">
          {t('components.drawdownEpisodes.noData')}
        </div>
      </ChartCard>
    );
  }

  return (
    <ChartCard title={t('components.drawdownEpisodes.title')}>
      <div className="space-y-6">
        {portfoliosWithEpisodes.map((portfolio, pIdx) => (
          <PortfolioDrawdownGroup
            key={portfolio.name}
            portfolio={portfolio}
            colorIndex={pIdx}
          />
        ))}
      </div>
    </ChartCard>
  );
}
