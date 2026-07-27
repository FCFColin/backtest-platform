/**
 * @file useTickerMeta hook
 * @description 从后端获取 ticker 元数据（名称/交易所/货币/最早日期）。
 *   300ms 防抖 + Map 缓存，避免重复请求。
 */
import { useState, useEffect } from 'react';

export interface TickerMeta {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  earliestDate?: string;
  isSynthetic?: boolean;
}

/** 内存级缓存 */
const cache = new Map<string, TickerMeta>();

/**
 * 获取 ticker 元数据的 hook（带防抖和缓存）。
 * @param ticker - 股票代码，如 "VTI"。
 * @returns 元数据或 null（加载中/未找到）。
 */
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
        const res = await fetch(`/api/v1/data/ticker-meta?ticker=${encodeURIComponent(upper)}`);
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
