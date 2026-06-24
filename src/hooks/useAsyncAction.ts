/**
 * @file useAsyncAction Hook
 * @description 封装异步操作的 loading / error 状态管理，提供统一的 run 包装器与 reset 方法
 * @example
 * const { isLoading, error, run, reset, setError } = useAsyncAction();
 * // 校验失败时直接设置错误（不触发 loading）
 * if (!valid) { setError('参数非法'); return; }
 * // 执行异步操作，自动管理 loading 与 error
 * await run(async () => { await fetch(...); });
 */
import { useState, useCallback } from 'react';

/** useAsyncAction 返回值结构 */
export interface UseAsyncActionResult {
  /** 是否正在执行异步操作 */
  isLoading: boolean;
  /** 最近一次错误信息（无错误时为 null） */
  error: string | null;
  /** 包装异步函数，自动管理 loading 与 error 状态；任务抛错时自动写入 error */
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>;
  /** 重置 loading 与 error 状态 */
  reset: () => void;
  /** 手动设置错误信息（用于参数校验等不触发 loading 的场景） */
  setError: (message: string | null) => void;
}

/**
 * 封装异步操作的 loading / error 状态管理
 *
 * - `run` 接收一个异步函数，执行前清空 error 并置 loading=true，执行完毕后置 loading=false
 * - 若异步函数抛错，error 会被设置为 Error.message，run 返回 undefined
 * - `setError` 用于参数校验等需要直接设置错误但不触发 loading 的场景
 * - `reset` 用于手动清空状态
 */
export function useAsyncAction(): UseAsyncActionResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await task();
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : '操作失败';
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
