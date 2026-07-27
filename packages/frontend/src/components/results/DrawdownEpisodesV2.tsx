/**
 * @file DrawdownEpisodesV2 组件
 * @description 回撤片段时间轴可视化：Header + 摘要4列 + 回撤列表（严重度条 + TimelineViz + 展开详情）。
 *   getSeverity: ≥20% severe / ≥10% moderate / else mild。
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatPercent, formatDuration } from '@/lib/formatters.js';
import { cn } from '@/lib/utils.js';
import type { DrawdownEpisode } from '@backtest/shared/types/backtest.js';

interface DrawdownEpisodesV2Props {
  episodes: DrawdownEpisode[];
  portfolioName?: string;
}

type Severity = 'all' | 'severe' | 'moderate' | 'mild';

/**
 * 回撤片段时间轴可视化组件。
 * @param props - episodes/portfolioName。
 * @returns 回撤片段容器元素。
 */
export function DrawdownEpisodesV2({ episodes }: DrawdownEpisodesV2Props) {
  const [severity, setSeverity] = useState<Severity>('all');
  const [sortBy, setSortBy] = useState<'depth' | 'duration' | 'recovery'>('depth');

  const filtered = episodes
    .filter((ep) => severity === 'all' || getSeverity(ep.depth) === severity)
    .sort((a, b) => {
      if (sortBy === 'depth') return a.depth - b.depth;
      if (sortBy === 'duration') return b.totalTimeDurationDays - a.totalTimeDurationDays;
      return (b.recoveryFactor ?? 0) - (a.recoveryFactor ?? 0);
    });

  const summary = {
    total: episodes.length,
    maxDepth: Math.min(...episodes.map((e) => e.depth), 0),
    avgDepth: episodes.length > 0 ? episodes.reduce((s, e) => s + e.depth, 0) / episodes.length : 0,
    avgRecovery:
      episodes.filter((e) => e.recoveryTime > 0).reduce((s, e) => s + e.recoveryTime, 0) /
      Math.max(episodes.filter((e) => e.recoveryTime > 0).length, 1),
  };

  return (
    <div className="bg-surface border border-border rounded-xl">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-h3">回撤片段</h3>
        <div className="flex items-center gap-2">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="text-caption bg-input-bg border border-border rounded-md px-2 py-1 text-fg"
          >
            <option value="all">全部</option>
            <option value="severe">严重 (≥20%)</option>
            <option value="moderate">中等 (≥10%)</option>
            <option value="mild">轻微 (&lt;10%)</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'depth' | 'duration' | 'recovery')}
            className="text-caption bg-input-bg border border-border rounded-md px-2 py-1 text-fg"
          >
            <option value="depth">按深度</option>
            <option value="duration">按持续时间</option>
            <option value="recovery">按恢复因子</option>
          </select>
        </div>
      </div>

      {/* 摘要行 */}
      <div className="grid grid-cols-4 gap-6 px-6 py-4 border-b border-border-subtle">
        <div>
          <div className="text-label-tiny text-fg-tertiary">总回撤次数</div>
          <div className="text-h3 font-mono tabular-nums">{summary.total}</div>
        </div>
        <div>
          <div className="text-label-tiny text-fg-tertiary">最大回撤</div>
          <div className="text-h3 font-mono tabular-nums text-neg">{formatPercent(summary.maxDepth)}</div>
        </div>
        <div>
          <div className="text-label-tiny text-fg-tertiary">平均回撤</div>
          <div className="text-h3 font-mono tabular-nums text-neg">{formatPercent(summary.avgDepth)}</div>
        </div>
        <div>
          <div className="text-label-tiny text-fg-tertiary">平均恢复时长</div>
          <div className="text-h3 font-mono tabular-nums">{formatDuration(Math.round(summary.avgRecovery))}</div>
        </div>
      </div>

      {/* 回撤列表 */}
      <div>
        {filtered.map((ep, i) => (
          <DrawdownEpisodeRow key={i} episode={ep} />
        ))}
      </div>
    </div>
  );
}

function DrawdownEpisodeRow({ episode }: { episode: DrawdownEpisode }) {
  const [expanded, setExpanded] = useState(false);
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
            <div className="text-h3 font-mono tabular-nums text-neg">
              {formatPercent(episode.depth)}
            </div>
          </div>
          <div className="flex-1">
            <TimelineViz episode={episode} />
          </div>
          <div className="text-caption text-fg-tertiary">
            {episode.recoveryDate ? '已恢复' : '未恢复'} ·{' '}
            {formatDuration(episode.totalTimeDurationDays)}
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
          <DetailField label="跌至谷底" value={formatDuration(episode.timeToTrough)} />
          {episode.recoveryTime > 0 && (
            <DetailField label="恢复时间" value={formatDuration(episode.recoveryTime)} />
          )}
          {episode.recoveryFactor !== undefined && (
            <DetailField label="恢复因子" value={episode.recoveryFactor.toFixed(2)} />
          )}
          {episode.cagrDuring !== undefined && (
            <DetailField label="期间 CAGR" value={formatPercent(episode.cagrDuring)} colorize />
          )}
          <DetailField label="期间 Ulcer" value={episode.ulcerDuring.toFixed(2)} />
        </div>
      )}
    </div>
  );
}

function TimelineViz({ episode }: { episode: DrawdownEpisode }) {
  const peakDate = new Date(episode.peakDate);
  const troughDate = new Date(episode.troughDate);
  const recoveryDate = episode.recoveryDate ? new Date(episode.recoveryDate) : null;

  const totalMs = recoveryDate
    ? recoveryDate.getTime() - peakDate.getTime()
    : Date.now() - peakDate.getTime();

  const troughPos = totalMs > 0 ? ((troughDate.getTime() - peakDate.getTime()) / totalMs) * 100 : 50;

  return (
    <div className="relative h-8">
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
        <div className="mt-1 text-micro text-fg-tertiary font-mono whitespace-nowrap">
          {episode.troughDate}
        </div>
      </div>
      {recoveryDate && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-2.5 h-2.5 rounded-full bg-success" />
          <div className="mt-1 text-micro text-fg-tertiary font-mono whitespace-nowrap">
            {episode.recoveryDate}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
  colorize,
}: {
  label: string;
  value: string;
  colorize?: boolean;
}) {
  return (
    <div>
      <div className="text-label-tiny text-fg-tertiary">{label}</div>
      <div
        className={cn(
          'text-body font-mono tabular-nums',
          colorize && value.startsWith('-') && 'text-neg',
          colorize && !value.startsWith('-') && 'text-pos',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function getSeverity(depth: number): 'severe' | 'moderate' | 'mild' {
  const abs = Math.abs(depth);
  if (abs >= 20) return 'severe';
  if (abs >= 10) return 'moderate';
  return 'mild';
}
