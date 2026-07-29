/**
 * @file RecentUpdatesCard 组件
 * @description 独立从 /api/v1/data/recent-updates 拉取最近更新标的列表。
 *   不依赖 stats 快照（后端 stats.recent_updates 长期为空，故独立 fetch）。
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { apiFetch } from '../../utils/apiClient.js';

/** 最近更新条目（对应 GET /api/v1/data/recent-updates 响应） */
interface RecentUpdate {
  ticker: string;
  name: string;
  lastBarDate: string | null;
  updatedAt: string | null;
}

/**
 * RecentUpdatesCard: 最近更新标的卡片。
 * @returns 渲染的最近更新卡片。
 */
export function RecentUpdatesCard() {
  const { t } = useTranslation();
  const [updates, setUpdates] = useState<RecentUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/v1/data/recent-updates?limit=10')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        setUpdates((json?.data ?? []) as RecentUpdate[]);
      })
      .catch(() => {
        if (!cancelled) setUpdates([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="p-4" data-testid="recent-updates-card">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.recentUpdates')}</div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-input-bg animate-pulse rounded" />
          ))}
        </div>
      ) : updates.length === 0 ? (
        <div className="text-caption text-fg-tertiary text-center py-6">
          {t('dataEngine.noRecentUpdates')}
        </div>
      ) : (
        <div className="space-y-1">
          {updates.map((u) => (
            <div
              key={u.ticker}
              className="flex items-center gap-3 py-[3px] text-caption"
              data-testid={`recent-update-${u.ticker}`}
            >
              <span className="font-mono text-fg w-20 flex-shrink-0">{u.ticker}</span>
              <span className="text-fg-secondary truncate flex-1">{u.name}</span>
              <span className="font-mono tabular-nums text-fg-tertiary">
                {u.lastBarDate ?? '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
