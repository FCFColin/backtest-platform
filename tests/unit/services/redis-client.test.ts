/**
 * redis 客户端单元测试
 *
 * 企业理由：Redis 连接配置错误会导致 BullMQ 队列不可用或应用层
 * 缓存失效。测试覆盖：
 * - redisConnection 与 appRedis 正确导出
 * - appRedis 配置 maxRetriesPerRequest=3（有限重试）
 * - redisConnection 配置 maxRetriesPerRequest=null（BullMQ 要求）
 * - appRedis 注册 error/connect/reconnecting 事件回调
 * - ADR-045：Sentinel 模式连接选项与单实例回退
 *
 * 权衡：mock ioredis，不验证真实 Redis 连接行为。
 */

import { describe, it, expect, vi } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';

// ===== vi.hoisted =====
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

// ===== Mock 模块 =====

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ REDIS_URL: 'redis://localhost:6379' }),
}));

vi.mock('ioredis', () => ({
  default: ioredisMocks.IORedis,
}));

import {
  redisConnection,
  appRedis,
} from '../../../packages/backend/src/infrastructure/redisClient.js';

describe('redisConnection（BullMQ 专用）', () => {
  it('应导出 redisConnection 实例', () => {
    expect(redisConnection).toBeDefined();
    expect(typeof redisConnection.on).toBe('function');
  });

  it('应使用解析自 REDIS_URL 的 host/port 连接（单实例模式）', () => {
    // ADR-045：单实例模式下 buildRedisBaseOptions 返回 parseRedisUrl 结果 {host, port}
    expect(ioredisMocks.IORedis).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
    );
  });

  it('maxRetriesPerRequest 应为 null（BullMQ 要求）', () => {
    // redisConnection 是第一个实例（先创建）
    const instance = ioredisMocks.instances[0];
    expect(instance.options.maxRetriesPerRequest).toBeNull();
  });

  it('enableReadyCheck 应为 false', () => {
    const instance = ioredisMocks.instances[0];
    expect(instance.options.enableReadyCheck).toBe(false);
  });
});

describe('appRedis（应用层通用）', () => {
  it('应导出 appRedis 实例', () => {
    expect(appRedis).toBeDefined();
    expect(typeof appRedis.on).toBe('function');
  });

  it('maxRetriesPerRequest 应为 3（有限重试）', () => {
    // appRedis 是第二个实例（后创建）
    const instance = ioredisMocks.instances[1];
    expect(instance.options.maxRetriesPerRequest).toBe(3);
  });

  it('enableReadyCheck 应为 true', () => {
    const instance = ioredisMocks.instances[1];
    expect(instance.options.enableReadyCheck).toBe(true);
  });

  it('lazyConnect 应为 true（延迟连接）', () => {
    const instance = ioredisMocks.instances[1];
    expect(instance.options.lazyConnect).toBe(true);
  });

  it('retryStrategy 应返回指数退避延迟（上限 5000ms）', () => {
    const instance = ioredisMocks.instances[1];
    const retryStrategy = instance.options.retryStrategy as (times: number) => number;

    expect(retryStrategy(1)).toBe(200); // 1 * 200 = 200
    expect(retryStrategy(2)).toBe(400); // 2 * 200 = 400
    expect(retryStrategy(5)).toBe(1000); // 5 * 200 = 1000
    expect(retryStrategy(25)).toBe(5000); // 25 * 200 = 5000，但上限 5000
    expect(retryStrategy(100)).toBe(5000); // 100 * 200 = 20000，但上限 5000
  });

  it('应注册 error 事件回调', () => {
    const instance = ioredisMocks.instances[1];
    expect(instance.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('应注册 connect 事件回调', () => {
    const instance = ioredisMocks.instances[1];
    expect(instance.on).toHaveBeenCalledWith('connect', expect.any(Function));
  });

  it('应注册 reconnecting 事件回调', () => {
    const instance = ioredisMocks.instances[1];
    expect(instance.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
  });

  it('error 事件回调应记录 warn 日志', () => {
    const instance = ioredisMocks.instances[1];
    const errorCall = instance.on.mock.calls.find((call: unknown[]) => call[0] === 'error');
    const errorCallback = errorCall![1] as (err: Error) => void;
    errorCallback(new Error('ECONNREFUSED'));

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.stringContaining('ECONNREFUSED') }),
      expect.stringContaining('appRedis 连接错误'),
    );
  });

  it('connect 事件回调应记录 info 日志', () => {
    const instance = ioredisMocks.instances[1];
    const connectCall = instance.on.mock.calls.find((call: unknown[]) => call[0] === 'connect');
    const connectCallback = connectCall![1] as () => void;
    connectCallback();

    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('appRedis 连接成功'));
  });

  it('reconnecting 事件回调应记录 info 日志', () => {
    const instance = ioredisMocks.instances[1];
    const reconnectingCall = instance.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'reconnecting',
    );
    const reconnectingCallback = reconnectingCall![1] as () => void;
    reconnectingCallback();

    expect(loggerMocks.info).toHaveBeenCalledWith(expect.stringContaining('appRedis 重连中'));
  });

  it('应注册 ready 事件回调（健康监测）', () => {
    const instance = ioredisMocks.instances[1];
    expect(instance.on).toHaveBeenCalledWith('ready', expect.any(Function));
  });

  it('应注册 end 事件回调（健康监测）', () => {
    const instance = ioredisMocks.instances[1];
    expect(instance.on).toHaveBeenCalledWith('end', expect.any(Function));
  });
});

describe('redisConnection 与 appRedis 配置隔离', () => {
  it('两个连接应使用不同的 maxRetriesPerRequest 配置', () => {
    const bullmqInstance = ioredisMocks.instances[0];
    const appInstance = ioredisMocks.instances[1];

    expect(bullmqInstance.options.maxRetriesPerRequest).toBeNull();
    expect(appInstance.options.maxRetriesPerRequest).toBe(3);
  });

  it('两个连接应是不同实例', () => {
    expect(redisConnection).not.toBe(appRedis);
  });
});

// ---------------------------------------------------------------------------
// ADR-045：Sentinel 模式连接选项
// ---------------------------------------------------------------------------

describe('Redis Sentinel 模式（ADR-045）', () => {
  it('配置 REDIS_SENTINELS 时应使用 Sentinel 连接选项', async () => {
    // 重新设置模块缓存，用含 REDIS_SENTINELS 的 config mock 重新加载 redisClient
    vi.resetModules();
    const sentinelConfig = createConfigMocks({
      REDIS_SENTINELS: 'sentinel-0:26379,sentinel-1:26379,sentinel-2:26379',
      REDIS_SENTINEL_NAME: 'mymaster',
      REDIS_PASSWORD: 'secret',
    });
    vi.doMock('../../../packages/backend/src/config/index.js', () => ({ config: sentinelConfig }));

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

    vi.doUnmock('../../../packages/backend/src/config/index.js');
    vi.doUnmock('ioredis');
  });
});
