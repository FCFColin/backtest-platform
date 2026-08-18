import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { fmtPct, formatDuration } from '@/utils/format.js';
import { getColorClass } from '@/components/charts/chartUtils.js';
import { cn } from '@/lib/utils.js';
import type { DrawdownEpisode } from '@backtest/shared/types/backtest';

type Severity = 'all' | 'severe' | 'moderate' | 'mild';
function getSeverity(depth: number): 'severe' | 'moderate' | 'mild' {
  const abs = Math.abs(depth);
  return abs >= 0.2 ? 'severe' : abs >= 0.1 ? 'moderate' : 'mild';
}
export function DrawdownEpisodes({
  episodes,
}: {
  episodes: DrawdownEpisode[];
  portfolioName?: string;
}) {
  const { t } = useTranslation();
  const [severity, setSeverity] = useState<Severity>('all');
  const [sortBy, setSortBy] = useState<'depth' | 'duration' | 'recovery'>('depth');
  const [displayLimit, setDisplayLimit] = useState(5);
  const filtered = episodes
    .filter((ep) => severity === 'all' || getSeverity(ep.depth) === severity)
    .sort((a, b) =>
      sortBy === 'depth'
        ? a.depth - b.depth
        : sortBy === 'duration'
          ? b.totalTimeDurationDays - a.totalTimeDurationDays
          : (b.recoveryFactor ?? 0) - (a.recoveryFactor ?? 0),
    );
  const displayed = filtered.slice(0, displayLimit);
  return (
    <div
      className="bg-surface border border-border rounded-xl"
      data-testid="drawdown-episodes-panel"
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-h3">{t('Drawdown Episodes')}</h3>
        <div className="flex items-center gap-2">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="text-caption bg-input-bg border border-border rounded-md px-2 py-1 text-fg"
            aria-label={t('Filter by severity')}
            data-testid="filter-severity"
          >
            <option value="all">{t('All')}</option>
            <option value="severe">{t('Severe (≥20%)')}</option>
            <option value="moderate">{t('Moderate (≥10%)')}</option>
            <option value="mild">{t('Mild (<10%)')}</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'depth' | 'duration' | 'recovery')}
            className="text-caption bg-input-bg border border-border rounded-md px-2 py-1 text-fg"
            aria-label={t('Sort episodes')}
            data-testid="sort-selector"
          >
            <option value="depth">{t('By Depth')}</option>
            <option value="duration">{t('By Duration')}</option>
            <option value="recovery">{t('By Recovery Factor')}</option>
          </select>
        </div>
      </div>
      <DrawdownSummary episodes={episodes} />
      <div>
        {displayed.map((ep) => (
          <DrawdownEpisodeRow key={ep.peakDate} episode={ep} />
        ))}
        {filtered.length > displayLimit && (
          <div className="p-4 border-t border-border-subtle text-center">
            <button
              onClick={() => setDisplayLimit((prev) => prev + 10)}
              className="text-caption text-brand hover:underline"
              data-testid="show-more-episodes"
            >
              {t('Show {{count}} more', { count: Math.min(10, filtered.length - displayLimit) })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
function DrawdownSummary({ episodes }: { episodes: DrawdownEpisode[] }) {
  const { t } = useTranslation();
  const avg = (xs: number[]) => (xs.length > 0 ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
  const neg = (v: number | null) => v !== null && v < 0;
  const maxDepth = episodes.length > 0 ? Math.min(...episodes.map((e) => e.depth)) : null;
  const avgRecovery = avg(episodes.filter((e) => e.recoveryTime > 0).map((e) => e.recoveryTime));
  const depths = episodes.map((e) => e.depth);
  const metrics = [
    { label: t('Total Drawdowns'), value: String(episodes.length) },
    { label: t('Max Drawdown'), value: fmtPct(maxDepth), neg: neg(maxDepth) },
    { label: t('Avg Drawdown'), value: fmtPct(avg(depths)), neg: neg(avg(depths)) },
    {
      label: t('Avg Recovery Duration'),
      value: avgRecovery === null ? '—' : formatDuration(Math.round(avgRecovery)),
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 px-6 py-4 border-b border-border-subtle">
      {metrics.map((m) => (
        <div key={m.label}>
          <div className="text-label-tiny text-fg-tertiary">{m.label}</div>
          <div className={cn('text-h3 font-mono tabular-nums', m.neg && 'text-danger')}>
            {m.value}
          </div>
        </div>
      ))}
    </div>
  );
}
function DrawdownEpisodeRow({ episode }: { episode: DrawdownEpisode }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const sev = getSeverity(episode.depth);
  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-stretch hover:bg-hover/50 transition-colors"
      >
        <div
          className={cn(
            'w-1 flex-shrink-0',
            sev === 'severe' && 'bg-danger',
            sev === 'moderate' && 'bg-warning',
            sev === 'mild' && 'bg-fg-tertiary/40',
          )}
        />
        <div className="flex-1 flex items-center gap-6 py-4 px-6">
          <div className="w-24 text-right">
            <div className="text-h3 font-mono tabular-nums text-danger">
              {fmtPct(episode.depth)}
            </div>
          </div>
          <div className="flex-1">
            <TimelineViz episode={episode} />
          </div>
          <div className="text-caption text-fg-tertiary flex flex-col items-end">
            <span data-testid="episode-status">
              {episode.recoveryDate ? t('Recovered') : t('Ongoing')}
            </span>
            <span className="font-mono tabular-nums" data-testid="episode-duration">
              {formatDuration(episode.totalTimeDurationDays)}
            </span>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-fg-tertiary" />
          ) : (
            <ChevronRight className="h-4 w-4 text-fg-tertiary" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-6 pb-4 pl-11 grid grid-cols-2 md:grid-cols-3 gap-4 bg-surface-sunken/30">
          <DetailField label={t('Time to Trough')} value={formatDuration(episode.timeToTrough)} />
          {episode.recoveryTime > 0 && (
            <DetailField label={t('Recovery Time')} value={formatDuration(episode.recoveryTime)} />
          )}
          {episode.recoveryFactor !== undefined && (
            <DetailField label={t('Recovery Factor')} value={episode.recoveryFactor.toFixed(2)} />
          )}
          {episode.cagrDuring !== undefined && (
            <DetailField
              label={t('Period CAGR')}
              value={fmtPct(episode.cagrDuring)}
              colorValue={episode.cagrDuring}
            />
          )}
          <DetailField label={t('Period Ulcer')} value={episode.ulcerDuring.toFixed(2)} />
        </div>
      )}
    </div>
  );
}
function TimelineViz({ episode }: { episode: DrawdownEpisode }) {
  const peakMs = new Date(episode.peakDate).getTime();
  const troughMs = new Date(episode.troughDate).getTime();
  const recoveryMs = episode.recoveryDate ? new Date(episode.recoveryDate).getTime() : null;
  const totalMs = recoveryMs ? recoveryMs - peakMs : Date.now() - peakMs;
  const troughPos = totalMs > 0 ? ((troughMs - peakMs) / totalMs) * 100 : 50;
  const troughLabelHidden = troughPos < 15;
  const recoveryLabelHidden = !!recoveryMs && 100 - troughPos < 15;
  return (
    <div className="relative h-8" data-testid="drawdown-timeline">
      <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border-subtle -translate-y-1/2" />
      <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
        <div className="w-2.5 h-2.5 rounded-full bg-fg-secondary" />
        <div className="mt-1 text-micro text-fg-tertiary font-mono whitespace-nowrap">
          {episode.peakDate}
        </div>
      </div>
      <div
        className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
        style={{ left: `${Math.max(0, Math.min(100, troughPos))}%` }}
      >
        <div className="w-3 h-3 rounded-full bg-danger" />
        {!troughLabelHidden && (
          <div className="mt-1 text-micro text-fg-tertiary font-mono whitespace-nowrap">
            {episode.troughDate}
          </div>
        )}
      </div>
      {recoveryMs && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-2.5 h-2.5 rounded-full bg-success" />
          {!recoveryLabelHidden && (
            <div className="mt-1 text-micro text-fg-tertiary font-mono whitespace-nowrap">
              {episode.recoveryDate}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function DetailField({
  label,
  value,
  colorValue,
}: {
  label: string;
  value: string;
  colorValue?: number;
}) {
  return (
    <div>
      <div className="text-label-tiny text-fg-tertiary">{label}</div>
      <div
        className={cn(
          'text-body font-mono tabular-nums',
          colorValue !== undefined && getColorClass(colorValue),
        )}
      >
        {value}
      </div>
    </div>
  );
}
