import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useTranslation, type UseTranslationOptions } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import i18n, { loadNamespace } from '@/i18n/index.js';
import { apiFetch } from '@/utils/apiClient';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';
import { useAuthStore } from '@/store/authStore';
interface UseAsyncActionResult {
  isLoading: boolean;
  error: string | null;
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>;
  reset: () => void;
  setError: (message: string | null) => void;
}
export function useAsyncAction(): UseAsyncActionResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await task();
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : i18n.t('errors.operationFailed');
      setError(message);
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
interface UseListStateResult<T> {
  items: T[];
  setItems: Dispatch<SetStateAction<T[]>>;
  addItem: () => void;
  removeItem: (index: number) => void;
  updateItem: (index: number, updater: (prev: T) => T) => void;
}
export function useListState<T>(
  initial: T[],
  makeDefault: () => T,
  minLength = 1,
): UseListStateResult<T> {
  const [items, setItems] = useState<T[]>(() => initial);
  const addItem = () => setItems((prev) => [...prev, makeDefault()]);
  const removeItem = (index: number) =>
    setItems((prev) => (prev.length > minLength ? prev.filter((_, i) => i !== index) : prev));
  const updateItem = (index: number, updater: (prev: T) => T) =>
    setItems((prev) => prev.map((item, i) => (i === index ? updater(item) : item)));
  return { items, setItems, addItem, removeItem, updateItem };
}
export function useNsT(ns: string, options?: UseTranslationOptions<string>) {
  const ret = useTranslation(ns, options);
  useEffect(() => {
    loadNamespace(ns).catch(() => {});
  }, [ns]);
  return ret;
}
type Theme = 'light' | 'dark';
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  return {
    theme,
    toggleTheme,
    isDark: theme === 'dark',
  };
}
interface UsePollingOptions {
  enabled?: boolean;
  deps?: unknown[];
  immediate?: boolean;
}
export function usePolling(
  fetchFn: () => void | Promise<void>,
  intervalMs: number,
  options: UsePollingOptions = {},
): void {
  const { enabled = true, deps = [], immediate = true } = options;
  useEffect(() => {
    if (!enabled) return;
    if (immediate) fetchFn();
    const interval = setInterval(fetchFn, intervalMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, immediate, ...deps]);
}
interface ComputeToolState<TResult> {
  isLoading: boolean;
  error: string | null;
  results: TResult | null;
  runCompute: () => void;
  setResults: (r: TResult | null) => void;
  reset: () => void;
}
export function useComputeTool<TResult>(
  computeFn: () => Promise<TResult>,
  validateFn?: () => string | null,
): ComputeToolState<TResult> {
  const { isLoading, error, run, setError, reset: resetAction } = useAsyncAction();
  const [results, setResults] = useState<TResult | null>(null);
  const runCompute = useCallback(() => {
    if (validateFn) {
      const validationError = validateFn();
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setResults(null);
    run(async () => {
      const data = await computeFn();
      setResults(data);
    });
  }, [computeFn, validateFn, run, setError]);
  const reset = useCallback(() => {
    resetAction();
    setResults(null);
  }, [resetAction]);
  return { isLoading, error, results, runCompute, setResults, reset };
}
export interface OptimizerLikeState<TResults> {
  startDate: string;
  setStartDate: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
  isLoading: boolean;
  setIsLoading: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
  results: TResults | null;
  setResults: (v: TResults | null) => void;
}
export function useOptimizerLikeState<TResults>(): OptimizerLikeState<TResults> {
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
export interface TickerMeta {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  earliestDate?: string;
  isSynthetic?: boolean;
}
const cache = new Map<string, TickerMeta>();
export function useTickerMeta(ticker: string): TickerMeta | null {
  const [meta, setMeta] = useState<TickerMeta | null>(null);
  useEffect(() => {
    if (!ticker || ticker.length < 1) {
      setMeta(null);
      return;
    }
    const upper = ticker.toUpperCase();
    if (cache.has(upper)) {
      setMeta(cache.get(upper) ?? null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/v1/data/ticker-meta?ticker=${encodeURIComponent(upper)}`, {
          silent: true,
        });
        if (!res.ok) return;
        const data = (await res.json()) as TickerMeta;
        cache.set(upper, data);
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
const HEARTBEAT_INTERVAL_MS = 60_000;
export function useIdleTimeout(timeoutMs: number, enabled: boolean): void {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef<boolean>(false);
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
    const elapsed = Date.now() - lastActivityRef.current;
    if (elapsed >= timeoutMs) {
      void triggerTimeout();
    }
  }, [enabled, timeoutMs, triggerTimeout]);
  useEffect(() => {
    if (!enabled || timeoutMs <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    triggeredRef.current = false;
    lastActivityRef.current = Date.now();
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, resetActivity, { passive: true });
    });
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkTimeout();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    timerRef.current = setInterval(checkTimeout, HEARTBEAT_INTERVAL_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, resetActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibility);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, timeoutMs, resetActivity, checkTimeout]);
}
