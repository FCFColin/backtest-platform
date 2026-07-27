/**
 * @file useDataMeta hook
 * @description 从后端获取数据元信息（最后更新/标的数/最早日期/数据点数）。
 *   5 分钟内存缓存。
 */
import { useState, useEffect } from 'react';

export interface DataMeta {
  lastUpdated: string;
  tickerCount: number;
  earliestDate: string;
  dataPointCount: number;
}

/** 内存缓存 */
let cachedMeta: DataMeta | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/**
 * 获取数据元信息 hook（5 分钟缓存）。
 * @returns meta 或 null（加载中）。
 */
export function useDataMeta(): DataMeta | null {
  const [meta, setMeta] = useState<DataMeta | null>(cachedMeta);

  useEffect(() => {
    if (cachedMeta && Date.now() - cacheTime < CACHE_TTL) {
      setMeta(cachedMeta);
      return;
    }

    fetch('/api/v1/data/meta')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const data = json?.data ?? json;
        if (data && data.lastUpdated) {
          cachedMeta = data;
          cacheTime = Date.now();
          setMeta(data);
        }
      })
      .catch(() => {
        setMeta(null);
      });
  }, []);

  return meta;
}
