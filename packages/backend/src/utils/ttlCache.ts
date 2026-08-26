export function createTtlCache<T>(ttlMs: number, maxEntries = 500) {
  const cache = new Map<string, { data: T; expiresAt: number }>();
  return {
    get(key: string): T | undefined {
      const hit = cache.get(key);
      if (hit && Date.now() < hit.expiresAt) return hit.data;
      cache.delete(key);
      return undefined;
    },
    set(key: string, data: T) {
      if (cache.size >= maxEntries) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    },
    clear() {
      cache.clear();
    },
  };
}

export type TtlCache<T> = ReturnType<typeof createTtlCache<T>>;

// 「get 命中即返回 → miss 则 fetch 并回填」的统一骨架。
// fetch 返回 null 不缓存（保持各站点「空结果不占 TTL」的原语义）；force 跳过读缓存。
// 失败兜底差异大（降级响应/空对象/null），交由调用方 .catch 处理。
export async function withTtlCache<T>(
  cache: TtlCache<T>,
  key: string,
  fetcher: () => Promise<T | null>,
  opts: { force?: boolean } = {},
): Promise<T | null> {
  if (!opts.force) {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
  }
  const data = await fetcher();
  if (data != null) cache.set(key, data);
  return data;
}
