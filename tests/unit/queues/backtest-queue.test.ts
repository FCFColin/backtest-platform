import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConfigMocks } from '../../helpers/mockFactories.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';
import { redisModuleMock } from '../../helpers/redisFixture.js';

const queueInstanceMocks = vi.hoisted(() => ({
  on: vi.fn(),
}));

const workerInstanceMocks = vi.hoisted(() => ({
  on: vi.fn(),
}));

const QueueMock = vi.hoisted(() => vi.fn(() => queueInstanceMocks));
const WorkerMock = vi.hoisted(() => vi.fn(() => workerInstanceMocks));

vi.mock('../../../packages/backend/src/config/env.js', () => ({
  config: createConfigMocks({ REDIS_URL: 'redis://localhost:6379' }),
  requireSecret: vi.fn(),
  parseCorsOrigins: vi.fn(),
  resolveJwtAlgorithm: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: vi.fn(() => ({ on: vi.fn(), publish: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => redisModuleMock);

const queueUtilsMocks = vi.hoisted(() => ({
  isFinalFailure: vi.fn(() => false),
}));

vi.mock('../../../packages/backend/src/queues/queueUtils.js', () => ({
  createDeadLetterQueue: vi.fn(() => ({ on: vi.fn() })),
  isFinalFailure: queueUtilsMocks.isFinalFailure,
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
import { appRedis } from '../../../packages/backend/src/infrastructure/redisClient.js';
describe('backtestQueue', () => {
  it('应导出 Queue 实例，使用正确连接配置并注册 error 回调', () => {
    expect(backtestQueue).toBeDefined();
    expect(typeof backtestQueue.on).toBe('function');
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
          removeOnFail: { age: 604800 },
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }),
      }),
    );
    expect(queueInstanceMocks.on).toHaveBeenCalledWith('error', expect.any(Function));
  });
  it('Queue error 回调应记录 error 日志', () => {
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
    queueInstanceMocks.on.mockClear();
  });

  const makeWorker = () => createBacktestWorker(vi.fn());
  const getCallback = (event: string) => {
    const call = workerInstanceMocks.on.mock.calls.find((c: unknown[]) => c[0] === event);
    return call![1];
  };
  it('应创建 Worker（concurrency=4）并返回实例', () => {
    const processFn = vi.fn().mockResolvedValue({ status: 'completed' });
    const worker = createBacktestWorker(processFn);

    expect(worker).toBeDefined();
    expect(WorkerMock).toHaveBeenCalledWith(
      'backtest-compute',
      processFn,
      expect.objectContaining({ concurrency: 4 }),
    );
    const eventNames = workerInstanceMocks.on.mock.calls.map((call: unknown[]) => call[0]);
    expect(eventNames).toContain('completed');
    expect(eventNames).toContain('failed');
    expect(eventNames).toContain('error');
  });
  it('completed 事件应记录 info 日志', () => {
    makeWorker();
    const completedCallback = getCallback('completed') as (job: unknown) => void;
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

  it('failed 事件应记录 error 日志，job 为 null 时不应抛错', () => {
    makeWorker();
    const failedCallback = getCallback('failed') as (job: unknown, err: Error) => void;
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
    expect(() => failedCallback(null, new Error('job not found'))).not.toThrow();
  });

  it('failed 事件：仅终态失败向 WS 广播，中间重试失败不广播', () => {
    makeWorker();
    const failedCallback = getCallback('failed') as (job: unknown, err: Error) => void;
    // workerFactory 的 DLQ 判定与 onFailed 各调用一次 isFinalFailure，用实现而非 Once 保证一致
    queueUtilsMocks.isFinalFailure.mockImplementation(
      (job: { attemptsMade: number }) => job.attemptsMade >= 3,
    );
    failedCallback(
      { id: 'job-retry', data: { type: 'grid-search' }, attemptsMade: 1 },
      new Error('transient'),
    );
    expect(appRedis.publish).not.toHaveBeenCalled();
    failedCallback(
      { id: 'job-final', data: { type: 'grid-search' }, attemptsMade: 3 },
      new Error('final failure'),
    );
    expect(appRedis.publish).toHaveBeenCalledWith(
      'backtest:progress:job-final',
      expect.stringContaining('"status":"failed"'),
    );
  });

  it('error 事件应记录 error 日志', () => {
    makeWorker();
    const errorCallback = getCallback('error') as (err: Error) => void;
    errorCallback(new Error('worker connection lost'));

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'worker connection lost' }),
      'BullMQ Worker connection error',
    );
  });

  it('应记录 Worker 创建日志', () => {
    makeWorker();
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
