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
      setError(e instanceof Error ? e.message : i18n.t('errors.operationFailed'));
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

export function useNsT(ns: string, options?: UseTranslationOptions<string>) {
  const ret = useTranslation(ns, options);
  useEffect(() => {
    loadNamespace(ns).catch(() => {});
  }, [ns]);
  return ret;
}

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    const s = localStorage.getItem('theme') as 'light' | 'dark' | null;
    return s ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });
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
    if (ve) {
      setError(ve);
      return;
    }
    setResults(null);
    run(async () => {
      setResults(await computeFn());
    });
  }, [computeFn, validateFn, run, setError]);
  return {
    isLoading,
    error,
    results,
    runCompute,
    setResults,
    reset: useCallback(() => {
      resetAction();
      setResults(null);
    }, [resetAction]),
  };
}

export function useOptimizerLikeState<TResults>() {
  const [startDate, setStartDate] = useState(DEFAULT_BACKTEST_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TResults | null>(null);
  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isLoading,
    setIsLoading,
    error,
    setError,
    results,
    setResults,
  };
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
    if (!ticker) {
      setMeta(null);
      return;
    }
    const upper = ticker.toUpperCase();
    if (tickerMetaCache.has(upper)) {
      setMeta(tickerMetaCache.get(upper) ?? null);
      return;
    }
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

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'keydown',
  'mousedown',
  'touchstart',
  'scroll',
];
const HEARTBEAT_MS = 60_000;
export function useIdleTimeout(timeoutMs: number, enabled: boolean): void {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    timerRef.current = setInterval(checkTimeout, HEARTBEAT_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
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
let pendingAnnouncements: Promise<Announcement[]> | null = null;
export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [readIds, setReadIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const s = localStorage.getItem(READ_KEY);
      if (s) setReadIds(new Set(JSON.parse(s)));
    } catch {
      /* noop */
    }
    if (!pendingAnnouncements) {
      pendingAnnouncements = apiFetch('/api/v1/announcements', { silent: true })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((j) => {
          const d = j.data ?? j ?? [];
          return Array.isArray(d) ? d : [];
        })
        .catch(() => [])
        .finally(() => {
          pendingAnnouncements = null;
        });
    }
    pendingAnnouncements.then(setAnnouncements);
  }, []);
  const unreadCount = announcements.filter((a) => !readIds.has(a.id)).length;
  const markAllRead = useCallback(() => {
    const all = new Set(announcements.map((a) => a.id));
    setReadIds(all);
    localStorage.setItem(READ_KEY, JSON.stringify([...all]));
  }, [announcements]);
  return { announcements, unreadCount, markAllRead };
}

interface DataMeta {
  lastUpdated: string;
  tickerCount: number;
  earliestDate: string;
  dataPointCount: number;
}
let cachedMeta: DataMeta | null = null;
let cacheTime = 0;
let pendingMeta: Promise<DataMeta | null> | null = null;
const CACHE_TTL = 5 * 60 * 1000;
function getPreloadedMeta(): DataMeta | null {
  try {
    const g =
      typeof window !== 'undefined'
        ? (window as { __INITIAL_DATA__?: unknown }).__INITIAL_DATA__
        : null;
    const d = (g && ((g as Record<string, unknown>).data ?? g)) as Partial<DataMeta>;
    if (d?.tickerCount !== undefined && d?.lastUpdated) {
      return {
        lastUpdated: d.lastUpdated,
        tickerCount: d.tickerCount,
        earliestDate: d.earliestDate || '',
        dataPointCount: d.dataPointCount || 0,
      };
    }
  } catch {
    /* noop */
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
    if (!pendingMeta) {
      pendingMeta = apiFetch('/api/v1/data/meta', { silent: true })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const d = j?.data ?? j;
          if (d?.lastUpdated) {
            cachedMeta = d;
            cacheTime = Date.now();
            return d;
          }
          return null;
        })
        .catch(() => null)
        .finally(() => {
          pendingMeta = null;
        });
    }
    pendingMeta.then(setMeta);
  }, []);
  return meta;
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
