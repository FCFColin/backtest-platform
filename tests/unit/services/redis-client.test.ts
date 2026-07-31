import { describe, it, expect, vi } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';

const loggerMocks = vi.hoisted(() => ({
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
}));

const ioredisMocks = vi.hoisted(() => {
  const instances: Array<{
    options: Record<string, unknown>;
    on: ReturnType<typeof vi.fn>;
  }> = [];
  return {
    instances,
    // ioredis 支持多种构造签名：(url, options)、(options)、()。
    // ADR-045 后 redisClient.ts 统一使用 (options) 单参数形式（buildRedisBaseOptions）。
    IORedis: vi.fn(function (this: unknown, ...args: unknown[]) {
      const opts =
        args.length >= 1 && typeof args[0] === 'object' && args[0] !== null
          ? { ...(args[0] as Record<string, unknown>) }
          : { url: args[0], ...((args[1] as Record<string, unknown>) ?? {}) };
      const instance = {
        options: opts,
        on: vi.fn(),
      };
      instances.push(instance);
      return instance;
    }),
  };
});

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/config/env.js', () => ({
  config: createConfigMocks({ REDIS_URL: 'redis://localhost:6379' }),
  requireSecret: vi.fn(),
  parseCorsOrigins: vi.fn(),
  resolveJwtAlgorithm: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: ioredisMocks.IORedis,
}));

import {
  redisConnection,
  appRedis,
} from '../../../packages/backend/src/infrastructure/redisClient.js';
describe('redisConnection（BullMQ 专用）', () => {
  it('应导出实例并使用解析自 REDIS_URL 的 host/port 连接（单实例模式）', () => {
    expect(redisConnection).toBeDefined();
    expect(typeof redisConnection.on).toBe('function');
    expect(ioredisMocks.IORedis).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
    );
  });
});
describe('appRedis（应用层通用）', () => {
  const instance = () => ioredisMocks.instances[1];

  it.each([
    ['maxRetriesPerRequest 应为 3（有限重试）', 'maxRetriesPerRequest', 3],
    ['enableReadyCheck 应为 true', 'enableReadyCheck', true],
    ['lazyConnect 应为 true（延迟连接）', 'lazyConnect', true],
  ])('%s', (_n, key, expected) => {
    expect(instance().options[key]).toBe(expected);
  });
  it('retryStrategy 应返回指数退避延迟（上限 5000ms）', () => {
    const retryStrategy = instance().options.retryStrategy as (times: number) => number;
    expect(retryStrategy(1)).toBe(200); // 1 * 200 = 200
    expect(retryStrategy(2)).toBe(400); // 2 * 200 = 400
    expect(retryStrategy(5)).toBe(1000); // 5 * 200 = 1000
    expect(retryStrategy(25)).toBe(5000); // 25 * 200 = 5000，但上限 5000
    expect(retryStrategy(100)).toBe(5000); // 100 * 200 = 20000，但上限 5000
  });

  it.each([
    ['error', 'error'],
    ['connect', 'connect'],
    ['reconnecting', 'reconnecting'],
    ['ready', 'ready'],
    ['end', 'end'],
  ])('应注册 %s 事件回调（健康监测）', (_n, event) => {
    expect(instance().on).toHaveBeenCalledWith(event, expect.any(Function));
  });

  it.each([
    ['error 事件回调应记录 warn 日志', 'error', 'appRedis 连接错误', 'warn'],
    ['connect 事件回调应记录 info 日志', 'connect', 'appRedis 连接成功', 'info'],
    ['reconnecting 事件回调应记录 info 日志', 'reconnecting', 'appRedis 重连中', 'info'],
  ])('%s', (_n, event, message, level) => {
    const call = instance().on.mock.calls.find((c: unknown[]) => c[0] === event);
    const callback = call![1] as (err?: Error) => void;
    callback(event === 'error' ? new Error('ECONNREFUSED') : undefined);
    const fn = loggerMocks[level as 'info' | 'warn'];
    if (event === 'error') {
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.stringContaining('ECONNREFUSED') }),
        expect.stringContaining(message),
      );
    } else {
      expect(fn).toHaveBeenCalledWith(expect.stringContaining(message));
    }
  });
});

describe('redisConnection 与 appRedis 配置隔离', () => {
  it('两个连接应是不同实例且使用不同的 maxRetriesPerRequest 配置', () => {
    expect(redisConnection).not.toBe(appRedis);
    expect(ioredisMocks.instances[0].options.maxRetriesPerRequest).toBeNull();
    expect(ioredisMocks.instances[1].options.maxRetriesPerRequest).toBe(3);
  });
});

// ADR-045：Sentinel 模式连接选项

describe('Redis Sentinel 模式（ADR-045）', () => {
  it('配置 REDIS_SENTINELS 时应使用 Sentinel 连接选项', async () => {
    // 重新设置模块缓存，用含 REDIS_SENTINELS 的 config mock 重新加载 redisClient
    vi.resetModules();
    const sentinelConfig = createConfigMocks({
      REDIS_SENTINELS: 'sentinel-0:26379,sentinel-1:26379,sentinel-2:26379',
      REDIS_SENTINEL_NAME: 'mymaster',
      REDIS_PASSWORD: 'secret',
    });
    vi.doMock('../../../packages/backend/src/config/env.js', () => ({
      config: sentinelConfig,
      requireSecret: vi.fn(),
      parseCorsOrigins: vi.fn(),
      resolveJwtAlgorithm: vi.fn(),
    }));

    // 新的 instances 收集器，避免与前面单实例用例混淆
    const sentinelInstances: Array<{ options: Record<string, unknown> }> = [];
    vi.doMock('ioredis', () => ({
      default: vi.fn(function (this: unknown, ...args: unknown[]) {
        const opts =
          args.length >= 1 && typeof args[0] === 'object' && args[0] !== null
            ? { ...(args[0] as Record<string, unknown>) }
            : {};
        const instance = { options: opts, on: vi.fn() };
        sentinelInstances.push(instance);
        return instance;
      }),
    }));

    const { buildRedisBaseOptions, isSentinelMode } =
      await import('../../../packages/backend/src/infrastructure/redisClient.js');

    expect(isSentinelMode).toBe(true);
    const opts = buildRedisBaseOptions();
    expect(opts.sentinels).toEqual([
      { host: 'sentinel-0', port: 26379 },
      { host: 'sentinel-1', port: 26379 },
      { host: 'sentinel-2', port: 26379 },
    ]);
    expect(opts.name).toBe('mymaster');
    expect(opts.password).toBe('secret');
    expect(opts.sentinelPassword).toBe('secret');

    // redisConnection（BullMQ）与 appRedis 两个实例均应携带 sentinels/name
    expect(sentinelInstances).toHaveLength(2);
    expect(sentinelInstances[0].options.sentinels).toEqual(opts.sentinels);
    expect(sentinelInstances[0].options.name).toBe('mymaster');
    expect(sentinelInstances[1].options.sentinels).toEqual(opts.sentinels);

    vi.doUnmock('../../../packages/backend/src/config/env.js');
    vi.doUnmock('ioredis');
  });
});
