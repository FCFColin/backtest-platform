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
    useRedisSuccess() {
      redisMocks.ping.mockResolvedValue('PONG');
      redisMocks.emit('ready');
    },
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
  getRedisHealth: vi.fn(async () => {
    try {
      return (await redisMocks.ping()) === 'PONG';
    } catch {
      return false;
    }
  }),
  markRedisUnhealthy: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(redisMocks.loggerMocks),
}));

import {
  isLockedOut,
  recordFailure,
  clearFailures,
  isIpBlocked,
  recordIpFailure,
  checkLoginRestriction,
} from '../../../packages/backend/src/application/auth/loginLockout.js';
import { createHash } from 'node:crypto';

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

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

  it('Redis 不可用时 clearFailures 应抛出 RedisUnavailableError（ADR-045）', async () => {
    redisMocks.useMemoryFallback();
    await expect(clearFailures('frank')).rejects.toThrow('Redis unavailable');
  });

  it('Redis 不可用时 recordFailure 应抛出 RedisUnavailableError（ADR-045）', async () => {
    redisMocks.useMemoryFallback();
    await expect(recordFailure('dave')).rejects.toThrow('Redis unavailable');
  });

  it('空 IP 时 isIpBlocked 应返回 0', async () => {
    await expect(isIpBlocked('')).resolves.toBe(0);
  });

  it('IP 未封锁时 isIpBlocked 返回 0', async () => {
    redisMocks.ttl.mockResolvedValueOnce(-2);
    await expect(isIpBlocked('192.168.1.1')).resolves.toBe(0);
  });

  it('IP 封锁中 isIpBlocked 返回剩余秒数', async () => {
    redisMocks.ttl.mockResolvedValueOnce(3600);
    await expect(isIpBlocked('10.0.0.1')).resolves.toBe(3600);
  });

  it('空 IP 时 recordIpFailure 应跳过', async () => {
    await recordIpFailure('');
    expect(redisMocks.incr).not.toHaveBeenCalled();
  });

  it('IP 失败达阈值应封锁 IP（SHA-256 哈希键）', async () => {
    redisMocks.incr.mockResolvedValueOnce(10);
    redisMocks.expire.mockResolvedValueOnce(1);
    redisMocks.set.mockResolvedValueOnce('OK');
    redisMocks.del.mockResolvedValueOnce(1);
    await recordIpFailure('203.0.113.5');
    expect(redisMocks.set).toHaveBeenCalledWith(
      'login_ip_lock:' + hashIp('203.0.113.5'),
      '1',
      'EX',
      3600,
    );
  });

  it('IP 首次失败应设置过期时间（SHA-256 哈希键）', async () => {
    redisMocks.incr.mockResolvedValueOnce(1);
    redisMocks.expire.mockResolvedValueOnce(1);
    await recordIpFailure('203.0.113.5');
    expect(redisMocks.expire).toHaveBeenCalledWith('login_ip_fail:' + hashIp('203.0.113.5'), 300);
  });

  it('同一 IP 多次失败后应触发封锁（跨账号撞库场景）', async () => {
    // 模拟 10 次失败（阈值为 10）
    for (let i = 1; i <= 10; i++) {
      redisMocks.incr.mockResolvedValueOnce(i);
      redisMocks.expire.mockResolvedValueOnce(1);
      if (i >= 10) {
        redisMocks.set.mockResolvedValueOnce('OK');
        redisMocks.del.mockResolvedValueOnce(1);
      }
      await recordIpFailure('198.51.100.1');
    }
    // 第 10 次时应设置封锁键
    expect(redisMocks.set).toHaveBeenCalledWith(
      'login_ip_lock:' + hashIp('198.51.100.1'),
      '1',
      'EX',
      3600,
    );
  });

  it('不同 IP 的失败计数独立（不互相影响）', async () => {
    redisMocks.incr.mockResolvedValueOnce(1);
    redisMocks.expire.mockResolvedValueOnce(1);
    await recordIpFailure('1.1.1.1');

    redisMocks.incr.mockResolvedValueOnce(1);
    redisMocks.expire.mockResolvedValueOnce(1);
    await recordIpFailure('2.2.2.2');

    // 两个不同 IP 的失败键应不同（哈希不同）
    const expireCalls = redisMocks.expire.mock.calls;
    expect(expireCalls[0][0]).toBe('login_ip_fail:' + hashIp('1.1.1.1'));
    expect(expireCalls[1][0]).toBe('login_ip_fail:' + hashIp('2.2.2.2'));
    expect(expireCalls[0][0]).not.toBe(expireCalls[1][0]);
  });

  it('checkLoginRestriction 账户锁定时应返回 account_locked', async () => {
    redisMocks.ttl.mockResolvedValueOnce(600); // user locked
    const result = await checkLoginRestriction('alice', '1.2.3.4');
    expect(result).toEqual({ locked: true, reason: 'account_locked', ttlSec: 600 });
  });

  it('checkLoginRestriction IP 封锁时应返回 ip_blocked', async () => {
    redisMocks.ttl.mockResolvedValueOnce(-2); // user not locked
    redisMocks.ttl.mockResolvedValueOnce(1800); // IP blocked
    const result = await checkLoginRestriction('alice', '1.2.3.4');
    expect(result).toEqual({ locked: true, reason: 'ip_blocked', ttlSec: 1800 });
  });

  it('checkLoginRestriction 未受限时应返回 locked=false', async () => {
    redisMocks.ttl.mockResolvedValueOnce(-2); // user not locked
    redisMocks.ttl.mockResolvedValueOnce(-2); // IP not blocked
    const result = await checkLoginRestriction('alice', '1.2.3.4');
    expect(result).toEqual({ locked: false, reason: '', ttlSec: 0 });
  });
});
