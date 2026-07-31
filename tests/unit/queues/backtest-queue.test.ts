import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const queueInstanceMocks = vi.hoisted(() => ({
  on: vi.fn(),
}));

const workerInstanceMocks = vi.hoisted(() => ({
  on: vi.fn(),
}));

const QueueMock = vi.hoisted(() => vi.fn(() => queueInstanceMocks));
const WorkerMock = vi.hoisted(() => vi.fn(() => workerInstanceMocks));

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
  default: vi.fn(() => ({ on: vi.fn(), publish: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  buildRedisBaseOptions: vi.fn(() => ({
    host: 'localhost',
    port: 6379,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  })),
  isSentinelMode: false,
  appRedis: { on: vi.fn(), publish: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../packages/backend/src/queues/dlqConfig.js', () => ({
  createDeadLetterQueue: vi.fn(() => ({ on: vi.fn() })),
  isFinalFailure: vi.fn(() => false),
  transferToDlq: vi.fn(),
  SOURCE_QUEUE_FAIL_RETENTION_AGE_SECONDS: 86400 * 7,
}));

vi.mock('bullmq', () => ({
  Queue: QueueMock,
  Worker: WorkerMock,
}));

import {
  backtestQueue,
  createBacktestWorker,
} from '../../../packages/backend/src/queues/backtestQueue.js';

describe('backtestQueue', () => {
  it('应导出 Queue 实例', () => {
    expect(backtestQueue).toBeDefined();
    expect(typeof backtestQueue.on).toBe('function');
  });

  it('Queue 应使用正确的连接配置', () => {
    expect(QueueMock).toHaveBeenCalledWith(
      'backtest-compute',
      expect.objectContaining({
        connection: expect.objectContaining({
          host: 'localhost',
          port: 6379,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        }),
        defaultJobOptions: expect.objectContaining({
          removeOnComplete: { count: 100 },
          // C-021: 失败任务保留 7 天（按 age 而非 count），最终失败任务转移到 DLQ
          removeOnFail: { age: 604800 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }),
      }),
    );
  });

  it('Queue 应注册 error 事件回调', () => {
    expect(queueInstanceMocks.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('Queue error 回调应记录 error 日志', () => {
    // C-021: 主队列与 DLQ 共享同一 mock 实例，均注册了 'error' 回调。
    // 调用所有 'error' 回调，验证主队列的错误日志被正确记录。
    const errorCalls = queueInstanceMocks.on.mock.calls.filter(
      (call: unknown[]) => call[0] === 'error',
    );
    expect(errorCalls.length).toBeGreaterThan(0);
    for (const call of errorCalls) {
      const errorCallback = call[1] as (err: Error) => void;
      errorCallback(new Error('redis connection lost'));
    }

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'redis connection lost', module: 'backtestQueue' }),
      'BullMQ Queue connection error',
    );
  });
});

describe('createBacktestWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重新设置 Queue.on mock（clearAllMocks 会清除）
    queueInstanceMocks.on.mockClear();
    // 重新导入模块以重新触发 Queue 构造
  });

  it('应创建 Worker 并返回实例', () => {
    const processFn = vi.fn().mockResolvedValue({ status: 'completed' });
    const worker = createBacktestWorker(processFn);

    expect(worker).toBeDefined();
    expect(WorkerMock).toHaveBeenCalledWith(
      'backtest-compute',
      processFn,
      expect.objectContaining({
        concurrency: 4,
      }),
    );
  });

  it('应注册 completed/failed/error 事件回调', () => {
    const processFn = vi.fn();
    createBacktestWorker(processFn);

    const eventNames = workerInstanceMocks.on.mock.calls.map((call: unknown[]) => call[0]);
    expect(eventNames).toContain('completed');
    expect(eventNames).toContain('failed');
    expect(eventNames).toContain('error');
  });

  it('completed 事件应记录 info 日志', () => {
    const processFn = vi.fn();
    createBacktestWorker(processFn);

    const completedCall = workerInstanceMocks.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'completed',
    );
    const completedCallback = completedCall![1] as (job: unknown) => void;
    completedCallback({
      id: 'job-123',
      data: { type: 'optimizer' },
      finishedOn: 1000,
      processedOn: 500,
    });

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-123',
        type: 'optimizer',
        durationMs: 500,
      }),
      'Backtest job completed',
    );
  });

  it('failed 事件应记录 error 日志', () => {
    const processFn = vi.fn();
    createBacktestWorker(processFn);

    const failedCall = workerInstanceMocks.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'failed',
    );
    const failedCallback = failedCall![1] as (job: unknown, err: Error) => void;
    failedCallback(
      { id: 'job-456', data: { type: 'grid-search' }, attemptsMade: 3 },
      new Error('engine timeout'),
    );

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-456',
        type: 'grid-search',
        error: 'engine timeout',
        attemptsMade: 3,
      }),
      'Backtest job failed',
    );
  });

  it('failed 事件 job 为 null 时不应抛错', () => {
    const processFn = vi.fn();
    createBacktestWorker(processFn);

    const failedCall = workerInstanceMocks.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'failed',
    );
    const failedCallback = failedCall![1] as (job: unknown, err: Error) => void;

    expect(() => failedCallback(null, new Error('job not found'))).not.toThrow();
  });

  it('error 事件应记录 error 日志', () => {
    const processFn = vi.fn();
    createBacktestWorker(processFn);

    const errorCall = workerInstanceMocks.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'error',
    );
    const errorCallback = errorCall![1] as (err: Error) => void;
    errorCallback(new Error('worker connection lost'));

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'worker connection lost' }),
      'BullMQ Worker connection error',
    );
  });

  it('应使用 concurrency=4 (WORKER_CONCURRENCY 默认值)', () => {
    const processFn = vi.fn();
    createBacktestWorker(processFn);

    expect(WorkerMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ concurrency: 4 }),
    );
  });

  it('应记录 Worker 创建日志', () => {
    const processFn = vi.fn();
    createBacktestWorker(processFn);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'backtestQueue', concurrency: 4 }),
      'Creating BullMQ worker...',
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'backtestQueue' }),
      'BullMQ worker created',
    );
  });
});
