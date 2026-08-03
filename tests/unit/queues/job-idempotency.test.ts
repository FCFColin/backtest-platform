/**
 * jobIdempotency 单元测试（T-37 / ADR-045）
 *
 * ADR-045：删除内存回退路径。Redis 不可用或操作失败时 requireRedis 抛出
 * RedisUnavailableError，由 Worker 捕获后经 BullMQ backoff 重试。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockLogger } from '../../helpers/mockFactories.js';
import { RedisUnavailableError } from '../../../packages/backend/src/utils/errors.js';

const redisMocks = vi.hoisted(() => ({
  set: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  get: vi.fn(),
  multi: vi.fn(),
  getRedisHealth: vi.fn(async () => true),
  markRedisUnhealthy: vi.fn(),
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
}));

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisMocks,
  getRedisHealth: redisMocks.getRedisHealth,
  markRedisUnhealthy: redisMocks.markRedisUnhealthy,
  bullmqConnectionOptions: {},
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(redisMocks.loggerMocks),
}));

import {
  tryClaimJobProcessing,
  markJobProcessed,
  releaseJobClaim,
  getProcessedJobResult,
} from '../../../packages/backend/src/queues/queueUtils.js';

describe('jobIdempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisMocks.getRedisHealth.mockResolvedValue(true);
    redisMocks.multi.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    });
  });

  it('Redis SET NX 成功时应声明处理权', async () => {
    redisMocks.exists.mockResolvedValueOnce(0);
    redisMocks.set.mockResolvedValueOnce('OK');
    await expect(tryClaimJobProcessing('job-1', 'test')).resolves.toBe('claimed');
    expect(redisMocks.set).toHaveBeenCalledWith(
      'bullmq:processing:test:job-1',
      '1',
      'EX',
      7200,
      'NX',
    );
  });

  it('Redis 已完成键存在时应返回 already_processed', async () => {
    redisMocks.exists.mockResolvedValueOnce(1);
    await expect(tryClaimJobProcessing('job-2', 'test')).resolves.toBe('already_processed');
    expect(redisMocks.set).not.toHaveBeenCalled();
  });

  it('Redis 处理中键已存在时应返回 in_progress', async () => {
    redisMocks.exists.mockResolvedValueOnce(0);
    redisMocks.set.mockResolvedValueOnce(null);
    await expect(tryClaimJobProcessing('job-3', 'test')).resolves.toBe('in_progress');
  });

  it('Redis 操作失败时应抛出 RedisUnavailableError（ADR-045）', async () => {
    redisMocks.exists.mockRejectedValueOnce(new Error('redis down'));
    await expect(tryClaimJobProcessing('job-4', 'test')).rejects.toThrow(RedisUnavailableError);
    expect(redisMocks.markRedisUnhealthy).toHaveBeenCalled();
  });

  it('markJobProcessed 应写入 Redis 并缓存结果', async () => {
    const multi = {
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    };
    redisMocks.multi.mockReturnValueOnce(multi);

    await markJobProcessed('job-5', 'test', { score: 1.2 });
    expect(multi.set).toHaveBeenCalledWith('bullmq:processed:test:job-5', '1', 'EX', 86400);
    expect(multi.set).toHaveBeenCalledWith(
      'bullmq:result:test:job-5',
      JSON.stringify({ score: 1.2 }),
      'EX',
      86400,
    );
    expect(multi.del).toHaveBeenCalledWith('bullmq:processing:test:job-5');
  });

  it('getProcessedJobResult 应读取缓存结果', async () => {
    redisMocks.get.mockResolvedValueOnce(JSON.stringify({ score: 1.2 }));
    await expect(getProcessedJobResult('job-6', 'test')).resolves.toEqual({ score: 1.2 });
  });

  it('releaseJobClaim 应删除处理中键', async () => {
    redisMocks.del.mockResolvedValueOnce(1);
    await releaseJobClaim('job-7', 'test');
    expect(redisMocks.del).toHaveBeenCalledWith('bullmq:processing:test:job-7');
  });

  it('Redis 健康检查失败时 tryClaimJobProcessing 应抛出 RedisUnavailableError', async () => {
    redisMocks.getRedisHealth.mockResolvedValueOnce(false);
    await expect(tryClaimJobProcessing('job-health-down', 'test')).rejects.toThrow(
      RedisUnavailableError,
    );
    expect(redisMocks.exists).not.toHaveBeenCalled();
  });

  it('getProcessedJobResult Redis 操作失败时应抛出 RedisUnavailableError', async () => {
    redisMocks.get.mockRejectedValueOnce(new Error('redis read down'));
    await expect(getProcessedJobResult('job-read-fail', 'test')).rejects.toThrow(
      RedisUnavailableError,
    );
    expect(redisMocks.markRedisUnhealthy).toHaveBeenCalled();
  });

  it('releaseJobClaim Redis 操作失败时应抛出 RedisUnavailableError', async () => {
    redisMocks.del.mockRejectedValueOnce(new Error('redis del down'));
    await expect(releaseJobClaim('job-del-fail', 'test')).rejects.toThrow(RedisUnavailableError);
    expect(redisMocks.markRedisUnhealthy).toHaveBeenCalled();
  });

  it('markJobProcessed Redis exec 失败时应抛出 RedisUnavailableError', async () => {
    const failingMulti = {
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn().mockRejectedValue(new Error('redis exec down')),
    };
    redisMocks.multi.mockReturnValueOnce(failingMulti);
    await expect(markJobProcessed('job-exec-fail', 'test', { score: 42 })).rejects.toThrow(
      RedisUnavailableError,
    );
    expect(redisMocks.markRedisUnhealthy).toHaveBeenCalled();
  });
});
