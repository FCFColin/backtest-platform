import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTtlCache } from '../../../packages/backend/src/utils/ttlCache.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createTtlCache', () => {
  it('set 后 get 返回数据，未命中返回 undefined', () => {
    const cache = createTtlCache<number>(1000);
    cache.set('k', 42);
    expect(cache.get('k')).toBe(42);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('过期条目 get 返回 undefined 并被清理', () => {
    const cache = createTtlCache<number>(1000);
    cache.set('k', 42);
    vi.advanceTimersByTime(1001);
    expect(cache.get('k')).toBeUndefined();
  });

  it('clear 清空全部条目', () => {
    const cache = createTtlCache<number>(1000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });
});
