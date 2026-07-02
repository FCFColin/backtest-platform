/**
 * BullMQ Worker 任务分发单元测试（Task 7.5）
 *
 * 企业理由：Worker 是异步任务的核心入口，任务类型分发错误会导致
 *   优化/网格搜索任务互相串结果，且难以排查。单元测试锁定分发逻辑。
 *
 * 测试覆盖：
 *   - grid-search 任务类型正确路由到 executeGridSearch
 *   - optimizer 任务类型正确路由到 executeOptimization（回归保护）
 *   - 未知任务类型返回 failed 错误
 *   - 引擎执行失败时返回 failed 状态
 *
 * 实现：mock 掉 Redis 连接和引擎执行，仅验证 worker 的任务分发逻辑。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===== mock 依赖（vi.mock 会被提升到顶部，先于 import 执行）=====

import { createLoggerMocks } from '../../helpers/mockFactories.js';

// mock logger，避免测试输出噪音
vi.mock('../../../api/utils/logger.js', () => ({ logger: createLoggerMocks() }));

// mock backtestQueue，避免创建真实 Redis 连接的 Worker
vi.mock('../../../api/queues/backtestQueue.js', () => ({
  createBacktestWorker: vi.fn(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// mock executeOptimization，避免真实回测执行
vi.mock('../../../api/application/optimizer-application-service.js', () => ({
  executeOptimization: vi.fn(),
}));

vi.mock('../../../api/application/grid-application-service.js', () => ({
  executeGridSearch: vi.fn(),
}));

vi.mock('../../../api/queues/jobIdempotency.js', () => ({
  tryClaimJobProcessing: vi.fn().mockResolvedValue('claimed'),
  getProcessedJobResult: vi.fn().mockResolvedValue(null),
  markJobProcessed: vi.fn().mockResolvedValue(undefined),
  releaseJobClaim: vi.fn().mockResolvedValue(undefined),
}));

// mock backtestRunRepo（落库副作用隔离）
vi.mock('../../../api/services/backtestRunRepo.js', () => ({
  createRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
}));

// mock 组织查询（tenant-fair 并发上限解析）
const membershipMocks = vi.hoisted(() => ({ getOrg: vi.fn() }));
vi.mock('../../../api/services/membershipService.js', () => membershipMocks);

// mock 应用层 Redis，避免真实连接 + 控制在途计数
const redisMocks = vi.hoisted(() => ({
  incr: vi.fn(),
  decr: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
}));
vi.mock('../../../api/config/redis.js', () => ({
  appRedis: redisMocks,
  redisConnection: {},
}));

// ===== 导入被测对象（在 mock 之后）=====

import { processBacktestJob } from '../../../api/queues/worker.js';
import { executeOptimization } from '../../../api/application/optimizer-application-service.js';
import { executeGridSearch } from '../../../api/application/grid-application-service.js';
import {
  tryClaimJobProcessing,
  getProcessedJobResult,
  releaseJobClaim,
  markJobProcessed,
} from '../../../api/queues/jobIdempotency.js';
import { getOrg } from '../../../api/services/membershipService.js';
import { appRedis } from '../../../api/config/redis.js';
import { DelayedError } from 'bullmq';
import type { BacktestJobData, BacktestJobResult } from '../../../api/queues/backtestQueue.js';
import type { Job } from 'bullmq';

/** 构造 mock Job 对象 */
function makeJob(data: BacktestJobData, id = 'job-1'): Job<BacktestJobData> {
  return {
    id,
    data,
  } as unknown as Job<BacktestJobData>;
}

describe('processBacktestJob - 任务分发', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('grid-search 任务类型', () => {
    it('应调用 executeGridSearch 并在成功时返回 completed', async () => {
      const mockResult = { success: true, data: { totalCombinations: 4, topResults: [] } };
      vi.mocked(executeGridSearch).mockResolvedValueOnce(mockResult);

      const job = makeJob({
        type: 'grid-search',
        payload: { indicator: 'sma', tickers: ['AAPL'] },
      });

      const result = await processBacktestJob(job);

      expect(executeGridSearch).toHaveBeenCalledTimes(1);
      expect(executeGridSearch).toHaveBeenCalledWith(job.data.payload);
      expect(result).toEqual<BacktestJobResult>({
        status: 'completed',
        result: mockResult.data,
      });
    });

    it('executeGridSearch 返回失败时应返回 failed', async () => {
      vi.mocked(executeGridSearch).mockResolvedValueOnce({
        success: false,
        error: '参数组合过多(250)，请缩小参数范围（上限200）',
      });

      const job = makeJob({
        type: 'grid-search',
        payload: { indicator: 'rsi' },
      });

      const result = await processBacktestJob(job);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('参数组合过多');
    });

    it('executeGridSearch 抛异常时应捕获并返回 failed', async () => {
      vi.mocked(executeGridSearch).mockRejectedValueOnce(new Error('Redis 连接失败'));

      const job = makeJob({
        type: 'grid-search',
        payload: { indicator: 'ema' },
      });

      const result = await processBacktestJob(job);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('Redis 连接失败');
    });
  });

  describe('optimizer 任务类型（回归保护）', () => {
    it('应调用 executeOptimization 并在成功时返回 completed', async () => {
      const mockResult = { success: true, data: { results: [], totalCombinations: 10 } };
      vi.mocked(executeOptimization).mockResolvedValueOnce(mockResult);

      const job = makeJob({
        type: 'optimizer',
        payload: { portfolio: { assets: [] } },
      });

      const result = await processBacktestJob(job);

      expect(executeOptimization).toHaveBeenCalledTimes(1);
      expect(executeOptimization).toHaveBeenCalledWith(job.data.payload);
      expect(result.status).toBe('completed');
    });
  });

  describe('未知任务类型', () => {
    it('应返回 failed 且 error 包含未知类型名', async () => {
      const job = makeJob({
        // 故意使用非法类型，绕过 TS 类型检查模拟运行时脏数据
        type: 'unknown-type' as BacktestJobData['type'],
        payload: {},
      });

      const result = await processBacktestJob(job);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('Unknown job type');
      expect(result.error).toContain('unknown-type');
      // 不应调用任何执行函数
      expect(executeGridSearch).not.toHaveBeenCalled();
      expect(executeOptimization).not.toHaveBeenCalled();
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
    });
  });

  describe('幂等守卫', () => {
    it('already_processed 且有缓存时应返回缓存结果', async () => {
      vi.mocked(tryClaimJobProcessing).mockResolvedValueOnce('already_processed');
      vi.mocked(getProcessedJobResult).mockResolvedValueOnce({ score: 0.9 });

      const job = makeJob({ type: 'optimizer', payload: {} });
      const result = await processBacktestJob(job);

      expect(result).toEqual<BacktestJobResult>({
        status: 'completed',
        result: { score: 0.9 },
      });
      expect(executeOptimization).not.toHaveBeenCalled();
    });

    it('in_progress 时应抛出 DelayedError 而非假 completed', async () => {
      vi.mocked(tryClaimJobProcessing).mockResolvedValueOnce('in_progress');

      const job = makeJob({ type: 'optimizer', payload: {} });
      await expect(processBacktestJob(job)).rejects.toBeInstanceOf(DelayedError);
      expect(executeOptimization).not.toHaveBeenCalled();
      expect(releaseJobClaim).not.toHaveBeenCalled();
      expect(markJobProcessed).not.toHaveBeenCalled();
    });
  });

  describe('releaseJobClaim 失败路径', () => {
    it('executeOptimization 失败时应释放 claim', async () => {
      vi.mocked(executeOptimization).mockResolvedValueOnce({
        success: false,
        error: '优化失败',
      });

      const job = makeJob({ type: 'optimizer', payload: {} });
      const result = await processBacktestJob(job);

      expect(result.status).toBe('failed');
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
      expect(markJobProcessed).not.toHaveBeenCalled();
    });

    it('executeGridSearch 失败时应释放 claim', async () => {
      vi.mocked(executeGridSearch).mockResolvedValueOnce({
        success: false,
        error: '网格搜索失败',
      });

      const job = makeJob({ type: 'grid-search', payload: {} });
      const result = await processBacktestJob(job);

      expect(result.status).toBe('failed');
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
      expect(markJobProcessed).not.toHaveBeenCalled();
    });

    it('executeGridSearch 抛异常时应释放 claim', async () => {
      vi.mocked(executeGridSearch).mockRejectedValueOnce(new Error('Redis 连接失败'));

      const job = makeJob({ type: 'grid-search', payload: {} });
      await processBacktestJob(job);

      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
      expect(markJobProcessed).not.toHaveBeenCalled();
    });
  });

  describe('tenant-fair 调度（ADR-037）', () => {
    const TENANT = '11111111-1111-1111-1111-111111111111';

    it('未携带 tenantId 时跳过在途门控（不触碰 Redis）', async () => {
      vi.mocked(executeOptimization).mockResolvedValueOnce({ success: true, data: { ok: 1 } });
      const job = makeJob({ type: 'optimizer', payload: {} });
      const result = await processBacktestJob(job);
      expect(result.status).toBe('completed');
      expect(appRedis.incr).not.toHaveBeenCalled();
    });

    it('在途数未超上限时正常处理并释放名额', async () => {
      vi.mocked(getOrg).mockResolvedValueOnce({
        orgId: TENANT,
        name: 'A',
        slug: 'a',
        plan: 'pro',
        status: 'active',
      });
      vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
      vi.mocked(executeOptimization).mockResolvedValueOnce({ success: true, data: { ok: 1 } });

      const job = makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT });
      const result = await processBacktestJob(job);

      expect(result.status).toBe('completed');
      expect(appRedis.incr).toHaveBeenCalledWith(`inflight:${TENANT}`);
      expect(appRedis.decr).toHaveBeenCalledWith(`inflight:${TENANT}`);
    });

    it('在途数超过计划上限时抛 DelayedError 并回退计数', async () => {
      // free 计划并发上限为 1；incr 返回 2 表示已超
      vi.mocked(getOrg).mockResolvedValueOnce({
        orgId: TENANT,
        name: 'A',
        slug: 'a',
        plan: 'free',
        status: 'active',
      });
      vi.mocked(appRedis.incr).mockResolvedValueOnce(2);

      const job = makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT });
      await expect(processBacktestJob(job)).rejects.toBeInstanceOf(DelayedError);
      expect(appRedis.decr).toHaveBeenCalledWith(`inflight:${TENANT}`);
      expect(executeOptimization).not.toHaveBeenCalled();
      expect(tryClaimJobProcessing).not.toHaveBeenCalled();
    });
  });
});

