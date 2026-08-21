import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import i18n from '@/i18n/index.js';
import { apiFetch, apiPostJSON } from '@/utils/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { reportError } from '@/utils/errorReporter';
import { useToastStore } from '@/store/toastStore';
export function useOrgAuth() {
  const isAuthed = useAuthStore((s) => s.isAuthenticated()),
    org = useAuthStore((s) => s.org),
    orgRole = useAuthStore((s) => s.user?.orgRole ?? null);
  return { isAuthed, org, orgRole, isAdmin: orgRole === 'owner' || orgRole === 'admin' };
}
export function useAsyncAction() {
  const [isLoading, setIsLoading] = useState(false),
    [error, setError] = useState<string | null>(null);
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
type SetterState<T> = T & { [K in keyof T as `set${Capitalize<string & K>}`]: (v: T[K]) => void };
export function useSetterState<T extends Record<string, unknown>>(initial: T): SetterState<T> {
  const [state, setState] = useState(initial);
  const set =
    <K extends keyof T>(k: K) =>
    (v: T[K]) =>
      setState((p) => ({ ...p, [k]: v }));
  return {
    ...state,
    ...Object.fromEntries(
      Object.keys(initial).map((k) => [`set${k[0].toUpperCase()}${k.slice(1)}`, set(k as keyof T)]),
    ),
  } as SetterState<T>;
}
export function useAssetList<T extends { ticker: string; weight: number | string }>(
  defaults: T[],
  factory: () => T,
  minLength = 1,
) {
  const [items, setItems] = useState<T[]>(() => defaults);
  return {
    assets: items,
    setAssets: setItems,
    addAsset: () => setItems((p) => [...p, factory()]),
    removeAsset: (i: number) =>
      setItems((p) => (p.length > minLength ? p.filter((_, j) => j !== i) : p)),
    updateAsset: (i: number, field: keyof T, val: T[keyof T]) =>
      setItems((p) => p.map((item, j) => (j === i ? { ...item, [field]: val } : item))),
    totalWeight: items.reduce((s, a) => s + (Number(a.weight) || 0), 0),
  };
}
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const h = (e: MediaQueryListEvent) => setMatches(e.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, [query]);
  return matches;
}
export function useChartAnimation(large: boolean) {
  const r = useMediaQuery('(prefers-reduced-motion: reduce)');
  return { isAnimationActive: !large && !r };
}
export function useTheme() {
  const pref = useSettingsStore((s) => s.theme),
    dark = useMediaQuery('(prefers-color-scheme: dark)'),
    resolvedTheme = pref === 'system' ? (dark ? 'dark' : 'light') : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);
  return {
    theme: pref,
    resolvedTheme,
    isDark: resolvedTheme === 'dark',
    setTheme: useSettingsStore((s) => s.setTheme),
    toggleTheme: useSettingsStore((s) => s.toggleTheme),
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
export function useAdminFetch<T>(
  url: string,
  parser: (data: Record<string, unknown>) => T,
  initial: T,
  componentName: string,
) {
  const [data, setData] = useState(initial),
    [lastRefresh, setLastRefresh] = useState(''),
    { isLoading: loading, run } = useAsyncAction();
  const fetch = () =>
    run(async () => {
      try {
        const r = await apiFetch(url);
        if (!r.ok) return;
        const j = await r.json();
        if (j.success && j.data) {
          setData(parser(j.data));
          setLastRefresh(new Date().toLocaleTimeString(i18n.language));
        }
      } catch (e) {
        reportError(e, { component: componentName, action: 'fetch' });
        useToastStore.getState().addToast('error', i18n.t('Load failed'));
      }
    });
  return { data, loading, lastRefresh, fetch };
}
export function useComputeTool<TResult>(
  computeFn: () => Promise<TResult>,
  validateFn?: () => string | null,
) {
  const { isLoading, error, run, setError, reset: resetAction } = useAsyncAction(),
    [results, setResults] = useState<TResult | null>(null);
  const runCompute = useCallback(() => {
    const ve = validateFn?.();
    if (ve) return void setError(ve);
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
export function useAnalysisState<S extends Record<string, unknown>, R>(
  endpoint: string,
  initial: S,
  buildBody: (s: S) => unknown,
  validate: (s: S) => string | null,
) {
  const s = useSetterState(initial);
  const {
    isLoading,
    error,
    results,
    runCompute: runAnalysis,
  } = useComputeTool<R>(
    async () => apiPostJSON<R>(endpoint, buildBody(s), i18n.t('Analysis failed')),
    () => validate(s),
  );
  return { ...s, isLoading, error, results, runAnalysis };
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
    const up = ticker.toUpperCase();
    if (tickerMetaCache.has(up)) return setMeta(tickerMetaCache.get(up) ?? null);
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch(`/api/v1/data/ticker-meta?ticker=${encodeURIComponent(up)}`, {
          silent: true,
        });
        if (!r.ok) return;
        const j = (await r.json()) as { data: TickerMeta };
        tickerMetaCache.set(up, j.data);
        setMeta(j.data);
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
    if (!cache.pending)
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
    cache.pending!.then(setData);
  }, [cache]);
  return data;
}
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const,
  HEARTBEAT_MS = 60_000;
export function useIdleTimeout(timeoutMs: number, enabled: boolean): void {
  const navigate = useNavigate(),
    logout = useAuthStore((s) => s.logout),
    lastActivity = useRef(Date.now()),
    triggered = useRef(false);
  const resetActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);
  const triggerTimeout = useCallback(async () => {
    if (triggered.current) return;
    triggered.current = true;
    await logout();
    navigate('/login?reason=session_expired', { replace: true });
  }, [logout, navigate]);
  const checkTimeout = useCallback(() => {
    if (enabled && timeoutMs > 0 && Date.now() - lastActivity.current >= timeoutMs)
      void triggerTimeout();
  }, [enabled, timeoutMs, triggerTimeout]);
  useEffect(() => {
    if (!enabled || timeoutMs <= 0) return;
    triggered.current = false;
    lastActivity.current = Date.now();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, resetActivity, { passive: true }));
    const onVis = () => {
      if (document.visibilityState === 'visible') checkTimeout();
    };
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(checkTimeout, HEARTBEAT_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, resetActivity));
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(id);
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
  const announcements = useCachedResource(announceCache),
    [readIds, setReadIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const s = localStorage.getItem(READ_KEY);
      if (s) setReadIds(new Set(JSON.parse(s)));
    } catch {
      /* corrupted */
    }
  }, []);
  const list = announcements ?? [];
  const markAllRead = useCallback(() => {
    const all = new Set(announcements?.map((a) => a.id) ?? []);
    setReadIds(all);
    localStorage.setItem(READ_KEY, JSON.stringify([...all]));
  }, [announcements]);
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
const META_TTL = 5 * 60 * 1000;
const metaCache = createResourceCache<DataMeta | null>(
  () =>
    apiFetch('/api/v1/data/meta', { silent: true })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const d = j?.data ?? j;
        return d?.lastUpdated ? d : null;
      })
      .catch(() => null),
  (() => {
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
      /* no valid preload */
    }
    return null;
  })(),
  META_TTL,
);
export function useDataMeta(): DataMeta | null {
  return useCachedResource(metaCache);
}
export type WorkerTask = { type: string; payload: unknown[] };
export function useChartCalcWorker<T>(task: WorkerTask | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState<string | null>(null),
    [isPending, setIsPending] = useState(false),
    workerRef = useRef<Worker | null>(null),
    idRef = useRef(0),
    lastId = useRef<number | null>(null),
    lastKey = useRef('');
  useEffect(() => {
    const w = new Worker(new URL('../workers/chartCalc.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = w;
    let dead = false;
    w.onmessage = (e: MessageEvent<{ id: number; result: T; error?: string }>) => {
      if (dead || e.data.id !== lastId.current) return;
      setIsPending(false);
      if (e.data.error) setError(e.data.error);
      else {
        setData(e.data.result);
        setError(null);
      }
    };
    return () => {
      dead = true;
      w.terminate();
      workerRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!task || !workerRef.current) return;
    const k = task.type + ':' + JSON.stringify(task.payload);
    if (k === lastKey.current) return;
    lastKey.current = k;
    setIsPending(true);
    const id = idRef.current++;
    lastId.current = id;
    workerRef.current.postMessage({ id, type: task.type, payload: task.payload });
  }, [task]);
  return { data, isPending, error };
}
