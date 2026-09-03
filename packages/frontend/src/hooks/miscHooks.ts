import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/utils/apiClient';
import { reportError } from '@/utils/errorReporter';
import { useToastStore } from '@/store/toastStore';
import i18n from '@/i18n/index.js';
import { useAsyncAction } from './useAsync.js';

export {
  useOrgAuth,
  useMediaQuery,
  useChartAnimation,
  useTheme,
  usePolling,
  useIdleTimeout,
} from './usePolling.js';
export { useAsyncAction, useComputeTool, useAnalysisState } from './useAsync.js';
export { useSetterState, useAssetList } from './useSetter.js';
export { useTickerMeta, useAnnouncements, useDataMeta, createResourceCache } from './useCache.js';
export type { WorkerTask } from './useCache.js';

export function useAdminFetch<T>(
  u: string,
  p: (d: Record<string, unknown>) => T,
  init: T,
  name: string,
) {
  const [data, setData] = useState(init);
  const [lastRefresh, setLastRefresh] = useState('');
  const { isLoading: loading, run } = useAsyncAction();
  const fetch = () =>
    run(async () => {
      try {
        const r = await apiFetch(u);
        const j = r.ok ? await r.json() : null;
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

export function useChartCalcWorker<T>(task: import('./useCache.js').WorkerTask | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const lastId = useRef<number | null>(null);
  const lastKey = useRef('');
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
    const id = ((lastKey.current = k), (lastId.current = idRef.current++));
    setIsPending(true);
    workerRef.current.postMessage({ id, ...task });
  }, [task]);
  return { data, isPending, error };
}
