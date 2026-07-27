import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import type { Stats } from './utils.js';
import { fmt } from './utils.js';
import { apiFetch } from '../../utils/apiClient.js';

/**
 * SampleTickersCard: 各类别样本标的卡片。
 * @param props - stats。
 * @returns 渲染的样本标的卡片。
 */
export function SampleTickersCard({ stats }: { stats: Stats }) {
  const { t } = useTranslation();
  const categoryLabels: Record<string, string> = {
    us_stock: t('dataEngine.usStockCategory'),
    us_etf: t('dataEngine.usEtfCategory'),
    cn_stock: t('dataEngine.cnStockCategory'),
    cn_etf: t('dataEngine.cnEtfCategory'),
    index: t('dataEngine.indexCategory'),
  };
  return (
    <Card className="p-4">
      <div className="mb-3 text-body font-semibold text-fg">{t('dataEngine.sampleTickers')}</div>
      {stats.sample_tickers &&
        Object.entries(stats.sample_tickers).map(
          ([category, items]) =>
            items.length > 0 && (
              <div key={category} className="mb-3">
                <div className="mb-1 text-caption font-semibold text-brand">
                  {categoryLabels[category] || category}
                </div>
                {items.map((tk) => (
                  <div
                    key={tk.ticker}
                    className="flex justify-between py-0.5 text-caption text-fg-secondary"
                  >
                    <span className="font-medium">{tk.ticker}</span>
                    <span className="text-fg-tertiary">
                      {tk.first_date} ~ {tk.last_date} ({fmt(tk.data_points)}
                      {t('common.days')})
                    </span>
                  </div>
                ))}
              </div>
            ),
        )}
    </Card>
  );
}

/** 最近更新条目（对应 GET /api/v1/data/recent-updates 响应） */
interface RecentUpdate {
  ticker: string;
  name: string;
  lastBarDate: string | null;
  updatedAt: string | null;
}

/**
 * RecentUpdatesCard: 最近更新标的卡片。
 *
 * 独立从 /api/v1/data/recent-updates 拉取，不依赖 stats 快照
 * （后端 stats.recent_updates 长期为空，故改为独立 fetch）。
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
    <Card className="p-4">
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
