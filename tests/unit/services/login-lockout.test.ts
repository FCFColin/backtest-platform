/**
 * loginLockout 单元测试（T-12）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';

const redisMocks = vi.hoisted(() => {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    ping: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    emit(event: string) {
      for (const h of handlers[event] ?? []) h();
    },
    ttl: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    /** 切换到 Redis 可用状态：ping 成功 + emit ready 让 redisHealth 缓存为 true */
    useRedisSuccess() {
      redisMocks.ping.mockResolvedValue('PONG');
      redisMocks.emit('ready');
    },
    /** 切换到 Redis 不可用状态：ping 失败 + emit error 让 redisHealth 缓存为 false */
    useMemoryFallback() {
      redisMocks.ping.mockRejectedValue(new Error('Redis not available'));
      redisMocks.emit('error');
    },
    loggerMocks: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      })),
    },
  };
});

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisMocks,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(redisMocks.loggerMocks),
}));

import {
  isLockedOut,
  recordFailure,
  clearFailures,
} from '../../../packages/backend/src/application/auth/loginLockout.js';

describe('loginLockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.useRedisSuccess();
  });

  it('未锁定时 isLockedOut 返回 0', async () => {
    redisMocks.ttl.mockResolvedValueOnce(-2);
    await expect(isLockedOut('User@Example.com')).resolves.toBe(0);
  });

  it('锁定中 isLockedOut 返回剩余秒数', async () => {
    redisMocks.ttl.mockResolvedValueOnce(120);
    await expect(isLockedOut('alice')).resolves.toBe(120);
  });

  it('连续失败达阈值应锁定账户', async () => {
    redisMocks.incr.mockResolvedValueOnce(5);
    redisMocks.expire.mockResolvedValueOnce(1);
    redisMocks.set.mockResolvedValueOnce('OK');
    redisMocks.del.mockResolvedValueOnce(1);

    await recordFailure('bob');
    expect(redisMocks.set).toHaveBeenCalled();
  });

  it('clearFailures 应清除计数与锁定', async () => {
    redisMocks.del.mockResolvedValueOnce(2);
    await clearFailures('carol');
    expect(redisMocks.del).toHaveBeenCalled();
  });

  it('首次失败应设置过期时间', async () => {
    redisMocks.incr.mockResolvedValueOnce(1);
    redisMocks.expire.mockResolvedValueOnce(1);
    await recordFailure('eve');
    expect(redisMocks.expire).toHaveBeenCalled();
  });

  it('Redis 不可用时 clearFailures 使用内存回退', async () => {
    redisMocks.useMemoryFallback();
    await clearFailures('frank');
    // 不抛出即表示内存回退成功
  });

  it('Redis 不可用时使用内存回退', async () => {
    redisMocks.useMemoryFallback();
    await recordFailure('dave');
    await recordFailure('dave');
    await recordFailure('dave');
    await recordFailure('dave');
    await recordFailure('dave');
    const remaining = await isLockedOut('dave');
    expect(remaining).toBeGreaterThan(0);
  });
});
