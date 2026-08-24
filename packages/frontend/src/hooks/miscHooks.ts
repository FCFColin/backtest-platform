import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import i18n from '@/i18n/index.js';
import { apiFetch, apiPostJSON } from '@/utils/apiClient';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { reportError } from '@/utils/errorReporter';
import { useToastStore } from '@/store/toastStore';
type AW = { ticker: string; weight: number | string };
type Parser<T> = (d: Record<string, unknown>) => T;
type PollOpts = { enabled?: boolean; deps?: unknown[]; immediate?: boolean };
type Dict = Record<string, unknown>;
type F = () => void | Promise<void>;
type B<S> = (s: S) => unknown;
type V<S> = (s: S) => string | null;
export function useOrgAuth() {
  const isAuthed = useAuthStore((s) => s.isAuthenticated()),
    org = useAuthStore((s) => s.org),
    orgRole = useAuthStore((s) => s.user?.orgRole ?? null);
  return { isAuthed, org, orgRole, isAdmin: orgRole === 'owner' || orgRole === 'admin' };
}
export function useAsyncAction() {
  const [isLoading, setIsLoading] = useState(false),
    [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T>(t: () => Promise<T>) => {
    setIsLoading(true);
    setError(null);
    try {
      return await t();
    } catch (e) {
      setError(e instanceof Error ? e.message : i18n.t('Operation failed'));
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, []);
  const reset = useCallback(() => (setIsLoading(false), setError(null)), []);
  return { isLoading, error, run, reset, setError };
}
type SetterState<T> = T & { [K in keyof T as `set${Capitalize<string & K>}`]: (v: T[K]) => void };
export function useSetterState<T extends Dict>(initial: T): SetterState<T> {
  const [state, setState] = useState(initial),
    mk = (k: string) => (v: unknown) => setState((p) => ({ ...p, [k]: v }));
  return {
    ...state,
    ...Object.fromEntries(
      Object.keys(initial).map((k) => [`set${k[0].toUpperCase()}${k.slice(1)}`, mk(k)]),
    ),
  } as SetterState<T>;
}
export function useAssetList<T extends AW>(d: T[], f: () => T, n = 1) {
  const [items, setItems] = useState<T[]>(() => d);
  return {
    assets: items,
    setAssets: setItems,
    addAsset: () => setItems((p) => [...p, f()]),
    removeAsset: (i: number) => setItems((p) => (p.length > n ? p.filter((_, j) => j !== i) : p)),
    updateAsset: (i: number, k: keyof T, v: T[keyof T]) =>
      setItems((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x))),
    totalWeight: items.reduce((s, a) => s + (Number(a.weight) || 0), 0),
  };
}
export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const w = window.matchMedia(q),
      h = (e: MediaQueryListEvent) => setM(e.matches);
    w.addEventListener('change', h);
    return () => w.removeEventListener('change', h);
  }, [q]);
  return m;
}
export function useChartAnimation(large: boolean) {
  const r = useMediaQuery('(prefers-reduced-motion: reduce)');
  return { isAnimationActive: !large && !r };
}
export function useTheme() {
  const pref = useSettingsStore((s) => s.theme),
    dark = useMediaQuery('(prefers-color-scheme: dark)'),
    t = pref === 'system' ? (dark ? 'dark' : 'light') : pref;
  useEffect(() => void (document.documentElement.dataset.theme = t), [t]);
  return {
    theme: pref,
    resolvedTheme: t,
    isDark: t === 'dark',
    setTheme: useSettingsStore((s) => s.setTheme),
    toggleTheme: useSettingsStore((s) => s.toggleTheme),
  };
}
export function usePolling(
  fn: F,
  ms: number,
  { enabled = true, deps = [], immediate = true }: PollOpts = {},
) {
  useEffect(() => {
    if (!enabled) return;
    if (immediate) fn();
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  }, [enabled, ms, immediate, ...deps]);
}
export function useAdminFetch<T>(u: string, p: Parser<T>, init: T, name: string) {
  const [data, setData] = useState(init),
    [lastRefresh, setLastRefresh] = useState(''),
    { isLoading: loading, run } = useAsyncAction();
  const fetch = () =>
    run(async () => {
      try {
        const r = await apiFetch(u),
          j = r.ok ? await r.json() : null;
        if (j?.success && j?.data) {
          setData(p(j.data));
          setLastRefresh(new Date().toLocaleTimeString(i18n.language));
        }
      } catch (e) {
        reportError(e, { component: name, action: 'fetch' });
        useToastStore.getState().addToast('error', i18n.t('Load failed'));
      }
    });
  return { data, loading, lastRefresh, fetch };
}
export function useComputeTool<R>(c: () => Promise<R>, v?: () => string | null) {
  const { isLoading, error, run, setError, reset: resetAction } = useAsyncAction(),
    [results, setResults] = useState<R | null>(null);
  const runCompute = useCallback(() => {
    const e = v?.();
    if (e) return void setError(e);
    run(() => c().then(setResults));
  }, [c, v, run, setError]);
  const reset = useCallback(() => (resetAction(), setResults(null)), [resetAction]);
  return { isLoading, error, results, runCompute, setResults, reset };
}
export function useAnalysisState<S extends Dict, R>(e: string, i: S, b: B<S>, v: V<S>) {
  const s = useSetterState(i),
    { isLoading, error, results, runCompute } = useComputeTool<R>(
      async () => apiPostJSON<R>(e, b(s), i18n.t('Analysis failed')),
      () => v(s),
    );
  return { ...s, isLoading, error, results, runAnalysis: runCompute };
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
    const up = ticker.toUpperCase(),
      hit = ticker ? tickerMetaCache.get(up) : undefined;
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
function createResourceCache<T>(fetcher: () => Promise<T>, initial: T | null = null, ttl = 0) {
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
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'] as const;
export function useIdleTimeout(timeoutMs: number, enabled: boolean): void {
  const navigate = useNavigate(),
    logout = useAuthStore((s) => s.logout),
    lastActivity = useRef(Date.now()),
    triggered = useRef(false);
  const resetActivity = useCallback(() => (lastActivity.current = Date.now()), []);
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
    const onVis = () => document.visibilityState === 'visible' && checkTimeout();
    document.addEventListener('visibilitychange', onVis);
    const id = setInterval(checkTimeout, 60_000);
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
const announceCache = createResourceCache<Announcement[]>(() =>
  apiFetch('/api/v1/announcements', { silent: true })
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((j) => (Array.isArray(j.data ?? j) ? (j.data ?? j) : []))
    .catch(() => []),
);
export function useAnnouncements() {
  const announcements = useCachedResource(announceCache),
    [readIds, setReadIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    try {
      const s = localStorage.getItem('announcements-read');
      if (s) setReadIds(new Set(JSON.parse(s)));
    } catch {}
  }, []);
  const list = announcements ?? [],
    markAllRead = useCallback(() => {
      const all = new Set(announcements?.map((a) => a.id) ?? []);
      setReadIds(all);
      localStorage.setItem('announcements-read', JSON.stringify([...all]));
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
const metaInitial = (): DataMeta | null => {
  try {
    const g = (window as { __INITIAL_DATA__?: Dict }).__INITIAL_DATA__,
      d = g && ((g.data ?? g) as Partial<DataMeta>);
    if (!d || d.tickerCount === undefined || !d.lastUpdated) return null;
    const m = { ...d, earliestDate: d.earliestDate || '', dataPointCount: d.dataPointCount || 0 };
    return m as DataMeta;
  } catch {}
  return null;
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
      setError(e.data.error ?? null);
      if (!e.data.error) setData(e.data.result);
    };
    return () => ((dead = true), w.terminate(), void (workerRef.current = null));
  }, []);
  useEffect(() => {
    if (!task || !workerRef.current) return;
    const k = task.type + ':' + JSON.stringify(task.payload);
    if (k === lastKey.current) return;
    const id = ((lastKey.current = k), (lastId.current = idRef.current++));
    setIsPending(true);
    workerRef.current.postMessage({ id, ...task });
  }, [task]);
  return { data, isPending, error };
}
