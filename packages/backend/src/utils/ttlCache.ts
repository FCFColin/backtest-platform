export function createTtlCache<T>(ttlMs: number) {
  const cache = new Map<string, { data: T; expiresAt: number }>();
  return {
    get(key: string): T | undefined {
      const hit = cache.get(key);
      if (hit && Date.now() < hit.expiresAt) return hit.data;
      cache.delete(key);
      return undefined;
    },
    set(key: string, data: T) {
      cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    },
    clear() {
      cache.clear();
    },
  };
}
