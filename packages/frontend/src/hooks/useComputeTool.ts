import { useState, useCallback } from 'react';
import { useAsyncAction } from './useAsyncAction.js';

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
