import { useState, useEffect } from 'react';
import { apiFetch } from '@/utils/apiClient';
interface TickerMeta {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  earliestDate?: string;
  isSynthetic?: boolean;
}
const tickerMetaCache = new Map<string, TickerMeta>();
export function useTickerMeta(ticker: string): TickerMeta | null {
  const [meta, setMeta] = useState<TickerMeta | null>(null);
  useEffect(() => {
    const up = ticker.toUpperCase();
    const hit = ticker ? tickerMetaCache.get(up) : undefined;
    if (!ticker || hit) return setMeta(hit ?? null);
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`/api/v1/data/ticker-meta?ticker=${encodeURIComponent(up)}`, {
          silent: true,
        });
        if (!r.ok) return;
        const j = (await r.json()) as { data: TickerMeta };
        setMeta(tickerMetaCache.set(up, j.data).get(up)!);
      } catch {
        setMeta(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [ticker]);
  return meta;
}
interface ResourceCache<T> {
  data: T | null;
  time: number;
  pending: Promise<T> | null;
  ttl: number;
  fetcher: () => Promise<T>;
}
export function createResourceCache<T>(
  fetcher: () => Promise<T>,
  initial: T | null = null,
  ttl = 0,
): ResourceCache<T> {
  return { data: initial, time: initial ? Date.now() : 0, pending: null, ttl, fetcher };
}
function useCachedResource<T>(cache: ResourceCache<T>): T | null {
  const [data, setData] = useState<T | null>(cache.data);
  useEffect(() => {
    if (cache.data && (!cache.ttl || Date.now() - cache.time < cache.ttl))
      return void setData(cache.data);
    if (!cache.pending)
      cache.pending = cache
        .fetcher()
        .then((d) => ((cache.data = d), (cache.time = Date.now()), d))
        .catch(() => null as T)
        .finally(() => (cache.pending = null));
    cache.pending!.then(setData);
  }, [cache]);
  return data;
}
interface Announcement {
  id: number;
  slug: string;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaLink?: string;
  variant: 'info' | 'success' | 'warning';
  publishedAt: string;
}
const announceCache = createResourceCache<Announcement[]>(() =>
  apiFetch('/api/v1/announcements', { silent: true })
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((j) => (Array.isArray(j.data ?? j) ? (j.data ?? j) : []))
    .catch(() => []),
);
export function useAnnouncements() {
  const announcements = useCachedResource(announceCache);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const s = localStorage.getItem('announcements-read');
      if (s) setReadIds(new Set(JSON.parse(s)));
    } catch {}
  }, []);
  const list = announcements ?? [];
  const markAllRead = () => {
    const all = new Set(announcements?.map((a) => a.id) ?? []);
    setReadIds(all);
    localStorage.setItem('announcements-read', JSON.stringify([...all]));
  };
  return {
    announcements: list,
    unreadCount: list.filter((a) => !readIds.has(a.id)).length,
    markAllRead,
  };
}
interface DataMeta {
  lastUpdated: string;
  tickerCount: number;
  earliestDate: string;
  dataPointCount: number;
}
const metaInitial = (): DataMeta | null => {
  try {
    const g = (window as { __INITIAL_DATA__?: Record<string, unknown> }).__INITIAL_DATA__;
    const d = g && ((g.data ?? g) as Partial<DataMeta>);
    if (!d || d.tickerCount === undefined || !d.lastUpdated) return null;
    return {
      ...d,
      earliestDate: d.earliestDate || '',
      dataPointCount: d.dataPointCount || 0,
    } as DataMeta;
  } catch {
    return null;
  }
};
const metaCache = createResourceCache<DataMeta | null>(
  () =>
    apiFetch('/api/v1/data/meta', { silent: true })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => ((j?.data ?? j)?.lastUpdated ? (j?.data ?? j) : null))
      .catch(() => null),
  metaInitial(),
  5 * 60 * 1000,
);
export const useDataMeta = (): DataMeta | null => useCachedResource(metaCache);
export type WorkerTask = { type: string; payload: unknown[] };
