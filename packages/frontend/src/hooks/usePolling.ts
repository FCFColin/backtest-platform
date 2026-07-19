import { useEffect } from 'react';

/** usePolling hook 的可选配置 */
interface UsePollingOptions {
  /** 是否启用轮询，默认 true */
  enabled?: boolean;
  /** 重新订阅的依赖数组，默认 [] */
  deps?: unknown[];
  /** 是否在订阅时立即执行一次，默认 true */
  immediate?: boolean;
}

/**
 * 通用轮询 hook：以固定间隔重复调用 fetchFn，并管理 setInterval 的订阅与清理。
 *
 * 行为等价于：
 * ```
 * useEffect(() => {
 *   if (enabled) {
 *     if (immediate) fetchFn();
 *     const interval = setInterval(fetchFn, intervalMs);
 *     return () => clearInterval(interval);
 *   }
 * }, [enabled, intervalMs, immediate, ...deps]);
 * ```
 *
 * @param fetchFn - 被轮询的函数；建议通过 useCallback 稳定化，否则每次依赖变化时捕获的是订阅时刻的版本
 * @param intervalMs - 轮询间隔（毫秒）
 * @param options - 可选配置：enabled / deps / immediate
 * @returns 无返回值
 */
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
