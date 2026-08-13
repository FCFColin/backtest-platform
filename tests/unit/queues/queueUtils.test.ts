import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redisModuleMock } from '../../helpers/redisFixture.js';

vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => redisModuleMock);

vi.mock('bullmq', () => ({
  Queue: vi
    .fn()
    .mockImplementation(() => ({ on: vi.fn(), add: vi.fn().mockResolvedValue(undefined) })),
}));

import {
  isFinalFailure,
  transferToDlq,
  createDeadLetterQueue,
} from '../../../packages/backend/src/queues/queueUtils.js';

describe('queueUtils', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('isFinalFailure', () => {
    it('attemptsMade >= opts.attempts 时返回 true', () => {
      expect(isFinalFailure({ attemptsMade: 3, opts: { attempts: 3 } })).toBe(true);
    });
    it('attemptsMade < opts.attempts 时返回 false', () => {
      expect(isFinalFailure({ attemptsMade: 1, opts: { attempts: 3 } })).toBe(false);
    });
    it('opts 缺省时默认 attempts=1', () => {
      expect(isFinalFailure({ attemptsMade: 1 })).toBe(true);
      expect(isFinalFailure({ attemptsMade: 0 })).toBe(false);
    });
  });

  describe('createDeadLetterQueue', () => {
    it('应创建 DLQ 并返回 Queue 实例', () => {
      const dlq = createDeadLetterQueue('test-queue');
      expect(dlq).toBeDefined();
      expect(dlq.on).toBeDefined();
    });
  });

  describe('transferToDlq', () => {
    it('job 无 id 时跳过转移', async () => {
      const dlq = { add: vi.fn() } as never;
      await transferToDlq(
        dlq,
        'src',
        { id: null, name: 'job', data: {}, attemptsMade: 1 },
        new Error('fail'),
      );
      expect(dlq.add).not.toHaveBeenCalled();
    });
    it('job 有 id 时应调用 dlq.add', async () => {
      const dlq = { add: vi.fn().mockResolvedValue(undefined) } as never;
      await transferToDlq(
        dlq,
        'src',
        { id: 'job-1', name: 'job', data: { x: 1 }, attemptsMade: 3 },
        new Error('boom'),
      );
      expect(dlq.add).toHaveBeenCalledWith(
        'dlq:src',
        expect.objectContaining({ sourceQueue: 'src', sourceJobId: 'job-1', error: 'boom' }),
        { jobId: 'job-1' },
      );
    });
    it('dlq.add 失败时不抛出', async () => {
      const dlq = { add: vi.fn().mockRejectedValue(new Error('redis down')) } as never;
      await expect(
        transferToDlq(
          dlq,
          'src',
          { id: 'job-2', name: 'job', data: {}, attemptsMade: 1 },
          new Error('orig'),
        ),
      ).resolves.toBeUndefined();
    });
  });
});
