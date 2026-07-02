/**
 * redis config 单元测试
 *
 * 企业理由：Redis 连接配置错误会导致 BullMQ 队列不可用或应用层
 * 缓存失效。测试覆盖：
 * - redisConnection 与 appRedis 正确导出
 * - appRedis 配置 maxRetriesPerRequest=3（有限重试）
 * - redisConnection 配置 maxRetriesPerRequest=null（BullMQ 要求）
 * - appRedis 注册 error/connect/reconnecting 事件回调
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
    IORedis: vi.fn(function (this: unknown, url: string, options: unknown) {
      const instance = {
        options: { url, ...options },
        on: vi.fn(),
      };
      instances.push(instance);
      return instance;
    }),
  };
});

// ===== Mock 模块 =====

vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));

vi.mock('../../../api/config/index.js', () => ({
  config: createConfigMocks({ REDIS_URL: 'redis://localhost:6379' }),
}));

vi.mock('ioredis', () => ({
  default: ioredisMocks.IORedis,
}));

import { redisConnection, appRedis } from '../../../api/config/redis.js';

describe('redisConnection（BullMQ 专用）', () => {
  it('应导出 redisConnection 实例', () => {
    expect(redisConnection).toBeDefined();
    expect(typeof redisConnection.on).toBe('function');
  });

  it('应使用 config.REDIS_URL 连接', () => {
    expect(ioredisMocks.IORedis).toHaveBeenCalledWith(
      'redis://localhost:6379',
      expect.objectContaining({
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
