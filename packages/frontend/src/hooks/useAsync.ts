import { useState, useCallback } from 'react';
import i18n from '@/i18n/index.js';
import { apiPostJSON } from '@/utils/apiClient';
import { useSetterState } from './useSetter.js';

type Dict = Record<string, unknown>;
type B<S> = (s: S) => unknown;
type V<S> = (s: S) => string | null;

export function useAsyncAction() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  return {
    isLoading,
    error,
    run,
    reset: useCallback(() => (setIsLoading(false), setError(null)), []),
    setError,
  };
}

export function useComputeTool<R>(c: () => Promise<R>, v?: () => string | null) {
  const { isLoading, error, run, setError, reset: resetAction } = useAsyncAction();
  const [results, setResults] = useState<R | null>(null);
  const runCompute = useCallback(() => {
    const e = v?.();
    if (e) return void setError(e);
    run(() => c().then(setResults));
  }, [c, v, run, setError]);
  return {
    isLoading,
    error,
    results,
    runCompute,
    setResults,
    reset: useCallback(() => (resetAction(), setResults(null)), [resetAction]),
  };
}

export function useAnalysisState<S extends Dict, R>(e: string, i: S, b: B<S>, v: V<S>) {
  const s = useSetterState(i);
  const { isLoading, error, results, runCompute } = useComputeTool<R>(
    async () => apiPostJSON<R>(e, b(s), i18n.t('Analysis failed')),
    () => v(s),
  );
  return { ...s, isLoading, error, results, runAnalysis: runCompute };
}
