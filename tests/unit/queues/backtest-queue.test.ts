/**
 * backtestQueue 单元测试
 *
 * 企业理由：BullMQ 任务队列是异步任务的基础设施，队列与 Worker
 * 配置错误会导致任务丢失或重复执行。测试覆盖：
 * - backtestQueue 正确导出 Queue 实例
 * - createBacktestWorker 创建 Worker 并注册事件回调
 * - Worker completed/failed/error 事件正确触发日志
 *
 * 权衡：mock bullmq 的 Queue 和 Worker，不验证真实 Redis 连接。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const queueInstanceMocks = vi.hoisted(() => ({
  on: vi.fn(),
}));

const workerInstanceMocks = vi.hoisted(() => ({
  on: vi.fn(),
}));

const QueueMock = vi.hoisted(() => vi.fn(() => queueInstanceMocks));
const WorkerMock = vi.hoisted(() => vi.fn(() => workerInstanceMocks));

// ===== Mock 模块 =====

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks({ REDIS_URL: 'redis://localhost:6379' }),
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
          removeOnFail: { count: 50 },
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
    // 找到 error 回调并调用
    const errorCall = queueInstanceMocks.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'error',
    );
    expect(errorCall).toBeDefined();
    const errorCallback = errorCall![1] as (err: Error) => void;
    errorCallback(new Error('redis connection lost'));

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: 'redis connection lost' }),
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
        concurrency: 3,
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

  it('应使用 concurrency=3', () => {
    const processFn = vi.fn();
    createBacktestWorker(processFn);

    expect(WorkerMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ concurrency: 3 }),
    );
  });

  it('应记录 Worker 创建日志', () => {
    const processFn = vi.fn();
    createBacktestWorker(processFn);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'backtestQueue', concurrency: 3 }),
      'Creating BullMQ worker...',
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'backtestQueue' }),
      'BullMQ worker created',
    );
  });
});
