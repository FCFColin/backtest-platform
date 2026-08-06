import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation, type UseTranslationOptions } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import i18n, { loadNamespace } from '@/i18n/index.js';
import { apiFetch } from '@/utils/apiClient';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { useAuthStore } from '@/store/authStore';

export function useAsyncAction() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    setIsLoading(true);
    setError(null);
    try {
      return await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t('Operation failed'));
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, []);
  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);
  return { isLoading, error, run, reset, setError };
}

export function useListState<T>(initial: T[], makeDefault: () => T, minLength = 1) {
  const [items, setItems] = useState<T[]>(() => initial);
  const addItem = () => setItems((p) => [...p, makeDefault()]);
  const removeItem = (i: number) =>
    setItems((p) => (p.length > minLength ? p.filter((_, j) => j !== i) : p));
  const updateItem = (i: number, u: (p: T) => T) =>
    setItems((p) => p.map((item, j) => (j === i ? u(item) : item)));
  return { items, setItems, addItem, removeItem, updateItem };
}

type SetterState<T> = T & {
  [K in keyof T as `set${Capitalize<string & K>}`]: (v: T[K]) => void;
};
export function useSetterState<T extends Record<string, unknown>>(initial: T): SetterState<T> {
  const [state, setState] = useState(initial);
  const set =
    <K extends keyof T>(key: K) =>
    (v: T[K]) =>
      setState((prev) => ({ ...prev, [key]: v }));
  const setters = Object.fromEntries(
    Object.keys(initial).map((k) => [`set${k[0].toUpperCase()}${k.slice(1)}`, set(k as keyof T)]),
  ) as SetterState<T>;
  return { ...state, ...setters } as SetterState<T>;
}

export function useAssetList<T extends { ticker: string; weight: number | string }>(
  defaults: T[],
  factory: () => T,
  minLength = 1,
) {
  const { items, setItems, addItem, removeItem, updateItem } = useListState<T>(
    defaults,
    factory,
    minLength,
  );
  const updateAsset = (i: number, field: keyof T, val: T[keyof T]) =>
    updateItem(i, (prev) => ({ ...prev, [field]: val }));
  return {
    assets: items,
    setAssets: setItems,
    addAsset: addItem,
    removeAsset: removeItem,
    updateAsset,
    totalWeight: items.reduce((sum, a) => sum + (Number(a.weight) || 0), 0),
  };
}

export function useNsT(ns: string, options?: UseTranslationOptions<string>) {
  const ret = useTranslation(ns, options);
  useEffect(() => {
    loadNamespace(ns).catch(() => {});
  }, [ns]);
  return ret;
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof window === 'undefined'
      ? 'dark'
      : ((localStorage.getItem('theme') as 'light' | 'dark' | null) ??
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')),
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  return {
    theme,
    toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    isDark: theme === 'dark',
  };
}

export function usePolling(
  fetchFn: () => void | Promise<void>,
  intervalMs: number,
  {
    enabled = true,
    deps = [],
    immediate = true,
  }: { enabled?: boolean; deps?: unknown[]; immediate?: boolean } = {},
) {
  useEffect(() => {
    if (!enabled) return;
    if (immediate) fetchFn();
    const id = setInterval(fetchFn, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, immediate, ...deps]);
}

export function useComputeTool<TResult>(
  computeFn: () => Promise<TResult>,
  validateFn?: () => string | null,
) {
  const { isLoading, error, run, setError, reset: resetAction } = useAsyncAction();
  const [results, setResults] = useState<TResult | null>(null);
  const runCompute = useCallback(() => {
    const ve = validateFn?.();
    if (ve) return void setError(ve);
    setResults(null);
    run(async () => {
      setResults(await computeFn());
    });
  }, [computeFn, validateFn, run, setError]);
  const reset = useCallback(() => {
    resetAction();
    setResults(null);
  }, [resetAction]);
  return { isLoading, error, results, runCompute, setResults, reset };
}

export function useOptimizerLikeState<TResults>() {
  return useSetterState({
    startDate: DEFAULT_BACKTEST_START_DATE,
    endDate: DEFAULT_END_DATE,
    isLoading: false,
    error: null as string | null,
    results: null as TResults | null,
  });
}

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
    if (!ticker) return void setMeta(null);
    const upper = ticker.toUpperCase();
    if (tickerMetaCache.has(upper)) return setMeta(tickerMetaCache.get(upper) ?? null);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/v1/data/ticker-meta?ticker=${encodeURIComponent(upper)}`, {
          silent: true,
        });
        if (!res.ok) return;
        const data = (await res.json()) as TickerMeta;
        tickerMetaCache.set(upper, data);
        setMeta(data);
      } catch {
        setMeta(null);
      }
    }, 300);
    return () => clearTimeout(timer);
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
function createResourceCache<T>(
  fetcher: () => Promise<T>,
  initial: T | null = null,
  ttl = 0,
): ResourceCache<T> {
  return { data: initial, time: initial ? Date.now() : 0, pending: null, ttl, fetcher };
}
function useCachedResource<T>(cache: ResourceCache<T>): T | null {
  const [data, setData] = useState<T | null>(cache.data);
  useEffect(() => {
    if (cache.data && (!cache.ttl || Date.now() - cache.time < cache.ttl)) {
      setData(cache.data);
      return;
    }
    if (!cache.pending) {
      cache.pending = cache
        .fetcher()
        .then((d) => {
          cache.data = d;
          cache.time = Date.now();
          return d;
        })
        .catch(() => null as T)
        .finally(() => {
          cache.pending = null;
        });
    }
    cache.pending!.then(setData);
  }, [cache]);
  return data;
}

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const;
const HEARTBEAT_MS = 60_000;
export function useIdleTimeout(timeoutMs: number, enabled: boolean): void {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const lastActivityRef = useRef(Date.now());
  const triggeredRef = useRef(false);
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);
  const triggerTimeout = useCallback(async () => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    await logout();
    navigate('/login?reason=session_expired', { replace: true });
  }, [logout, navigate]);
  const checkTimeout = useCallback(() => {
    if (!enabled || timeoutMs <= 0) return;
    if (Date.now() - lastActivityRef.current >= timeoutMs) void triggerTimeout();
  }, [enabled, timeoutMs, triggerTimeout]);
  useEffect(() => {
    if (!enabled || timeoutMs <= 0) return;
    triggeredRef.current = false;
    lastActivityRef.current = Date.now();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }));
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkTimeout();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const timerId = setInterval(checkTimeout, HEARTBEAT_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(timerId);
    };
  }, [enabled, timeoutMs, resetActivity, checkTimeout]);
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
const READ_KEY = 'announcements-read';
const announceCache = createResourceCache<Announcement[]>(() =>
  apiFetch('/api/v1/announcements', { silent: true })
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((j) => {
      const d = j.data ?? j ?? [];
      return Array.isArray(d) ? d : [];
    })
    .catch(() => []),
);
export function useAnnouncements() {
  const announcements = useCachedResource(announceCache);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const s = localStorage.getItem(READ_KEY);
      if (s) setReadIds(new Set(JSON.parse(s)));
    } catch {
      // localStorage 不可用/损坏时忽略
    }
  }, []);
  const list = announcements ?? [];
  const unreadCount = list.filter((a) => !readIds.has(a.id)).length;
  const markAllRead = useCallback(() => {
    const all = new Set(announcements?.map((a) => a.id) ?? []);
    setReadIds(all);
    localStorage.setItem(READ_KEY, JSON.stringify([...all]));
  }, [announcements]);
  return { announcements: list, unreadCount, markAllRead };
}

interface DataMeta {
  lastUpdated: string;
  tickerCount: number;
  earliestDate: string;
  dataPointCount: number;
}
const META_TTL = 5 * 60 * 1000;
function getPreloadedMeta(): DataMeta | null {
  try {
    const g =
      typeof window !== 'undefined'
        ? (window as { __INITIAL_DATA__?: Record<string, unknown> }).__INITIAL_DATA__
        : null;
    const d = (g && (g.data ?? g)) as Partial<DataMeta>;
    if (d?.tickerCount !== undefined && d?.lastUpdated)
      return {
        lastUpdated: d.lastUpdated,
        tickerCount: d.tickerCount,
        earliestDate: d.earliestDate || '',
        dataPointCount: d.dataPointCount || 0,
      };
  } catch {
    // 预加载元数据缺失/损坏时忽略
  }
  return null;
}
const metaCache = createResourceCache<DataMeta | null>(
  () =>
    apiFetch('/api/v1/data/meta', { silent: true })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d = j?.data ?? j;
        return d?.lastUpdated ? d : null;
      })
      .catch(() => null),
  getPreloadedMeta(),
  META_TTL,
);
export function useDataMeta(): DataMeta | null {
  return useCachedResource(metaCache);
}

export type WorkerTask = { type: string; payload: unknown[] };
export function useChartCalcWorker<T>(task: WorkerTask | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const lastKeyRef = useRef('');
  useEffect(() => {
    const w = new Worker(new URL('../workers/chartCalc.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = w;
    let terminated = false;
    w.onmessage = (e: MessageEvent<{ id: number; result: T; error?: string }>) => {
      if (terminated) return;
      setIsPending(false);
      if (e.data.error) {
        setError(e.data.error);
      } else {
        setData(e.data.result);
        setError(null);
      }
    };
    return () => {
      terminated = true;
      w.terminate();
      workerRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!task || !workerRef.current) return;
    const key = task.type + ':' + JSON.stringify(task.payload);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    setIsPending(true);
    workerRef.current.postMessage({ id: idRef.current++, type: task.type, payload: task.payload });
  }, [task]);
  return { data, isPending, error };
}
