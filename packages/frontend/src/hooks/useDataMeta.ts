import { useState, useEffect } from 'react';
import { apiFetch } from '@/utils/apiClient.js';
export interface DataMeta {
  lastUpdated: string;
  tickerCount: number;
  earliestDate: string;
  dataPointCount: number;
}
let cachedMeta: DataMeta | null = null;
let cacheTime = 0;
let pendingMetaPromise: Promise<DataMeta | null> | null = null;
const CACHE_TTL = 5 * 60 * 1000;
function getPreloadedMeta(): DataMeta | null {
  try {
    const global =
      typeof window !== 'undefined'
        ? (window as { __INITIAL_DATA__?: unknown }).__INITIAL_DATA__
        : null;
    if (!global) return null;
    const data = ((global as Record<string, unknown>).data ?? global) as Partial<DataMeta>;
    if (data?.tickerCount !== undefined && data?.lastUpdated) {
      return {
        lastUpdated: data.lastUpdated,
        tickerCount: data.tickerCount,
        earliestDate: data.earliestDate || '',
        dataPointCount: data.dataPointCount || 0,
      };
    }
  } catch {
    /* 忽略 */
  }
  return null;
}
const preloaded = getPreloadedMeta();
if (preloaded) {
  cachedMeta = preloaded;
  cacheTime = Date.now();
}
export function useDataMeta(): DataMeta | null {
  const [meta, setMeta] = useState<DataMeta | null>(cachedMeta);
  useEffect(() => {
    if (cachedMeta && Date.now() - cacheTime < CACHE_TTL) {
      setMeta(cachedMeta);
      return;
    }
    if (!pendingMetaPromise) {
      pendingMetaPromise = apiFetch('/api/v1/data/meta', { silent: true })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          const data = json?.data ?? json;
          if (data && data.lastUpdated) {
            cachedMeta = data;
            cacheTime = Date.now();
            return data;
          }
          return null;
        })
        .catch(() => null)
        .finally(() => {
          pendingMetaPromise = null;
        });
    }
    pendingMetaPromise.then((data) => setMeta(data));
  }, []);
  return meta;
}
