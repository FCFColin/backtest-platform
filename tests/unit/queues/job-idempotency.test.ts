import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisUnavailableError } from '../../../packages/backend/src/utils/errors.js';
import { redisModuleMock } from '../../helpers/redisFixture.js';
import type { RedisTestMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => redisModuleMock);

import {
  tryClaimJobProcessing,
  markJobProcessed,
  releaseJobClaim,
  getProcessedJobResult,
} from '../../../packages/backend/src/queues/queueUtils.js';
import { appRedis as appRedisReal } from '../../../packages/backend/src/infrastructure/redisClient.js';

const appRedis = appRedisReal as unknown as RedisTestMocks;

describe('jobIdempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appRedis.multi.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    });
  });

  it('Redis SET NX 成功时应声明处理权', async () => {
    appRedis.exists.mockResolvedValueOnce(0);
    appRedis.set.mockResolvedValueOnce('OK');
    await expect(tryClaimJobProcessing('job-1', 'test')).resolves.toBe('claimed');
    expect(appRedis.set).toHaveBeenCalledWith(
      'bullmq:processing:test:job-1',
      '1',
      'EX',
      7200,
      'NX',
    );
  });

  it('Redis 已完成键存在时应返回 already_processed', async () => {
    appRedis.exists.mockResolvedValueOnce(1);
    await expect(tryClaimJobProcessing('job-2', 'test')).resolves.toBe('already_processed');
    expect(appRedis.set).not.toHaveBeenCalled();
  });

  it('Redis 处理中键已存在时应返回 in_progress', async () => {
    appRedis.exists.mockResolvedValueOnce(0);
    appRedis.set.mockResolvedValueOnce(null);
    await expect(tryClaimJobProcessing('job-3', 'test')).resolves.toBe('in_progress');
  });

  it('Redis 操作失败时应抛出 RedisUnavailableError（DADR-045）', async () => {
    appRedis.exists.mockRejectedValueOnce(new Error('redis down'));
    await expect(tryClaimJobProcessing('job-4', 'test')).rejects.toThrow(RedisUnavailableError);
    expect(appRedis.markRedisUnhealthy).toHaveBeenCalled();
  });

  it('markJobProcessed 应写入 Redis 并缓存结果', async () => {
    const multi = {
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    };
    appRedis.multi.mockReturnValueOnce(multi);

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
    appRedis.get.mockResolvedValueOnce(JSON.stringify({ score: 1.2 }));
    await expect(getProcessedJobResult('job-6', 'test')).resolves.toEqual({ score: 1.2 });
  });

  it('releaseJobClaim 应删除处理中键', async () => {
    appRedis.del.mockResolvedValueOnce(1);
    await releaseJobClaim('job-7', 'test');
    expect(appRedis.del).toHaveBeenCalledWith('bullmq:processing:test:job-7');
  });

  it('Redis 健康检查失败时 tryClaimJobProcessing 应抛出 RedisUnavailableError', async () => {
    appRedis.getRedisHealth.mockResolvedValueOnce(false);
    await expect(tryClaimJobProcessing('job-health-down', 'test')).rejects.toThrow(
      RedisUnavailableError,
    );
    expect(appRedis.exists).not.toHaveBeenCalled();
  });

  it('getProcessedJobResult Redis 操作失败时应抛出 RedisUnavailableError', async () => {
    appRedis.get.mockRejectedValueOnce(new Error('redis read down'));
    await expect(getProcessedJobResult('job-read-fail', 'test')).rejects.toThrow(
      RedisUnavailableError,
    );
    expect(appRedis.markRedisUnhealthy).toHaveBeenCalled();
  });

  it('releaseJobClaim Redis 操作失败时应抛出 RedisUnavailableError', async () => {
    appRedis.del.mockRejectedValueOnce(new Error('redis del down'));
    await expect(releaseJobClaim('job-del-fail', 'test')).rejects.toThrow(RedisUnavailableError);
    expect(appRedis.markRedisUnhealthy).toHaveBeenCalled();
  });

  it('markJobProcessed Redis exec 失败时应抛出 RedisUnavailableError', async () => {
    const failingMulti = {
      set: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      exec: vi.fn().mockRejectedValue(new Error('redis exec down')),
    };
    appRedis.multi.mockReturnValueOnce(failingMulti);
    await expect(markJobProcessed('job-exec-fail', 'test', { score: 42 })).rejects.toThrow(
      RedisUnavailableError,
    );
    expect(appRedis.markRedisUnhealthy).toHaveBeenCalled();
  });
});
