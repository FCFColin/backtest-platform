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

// mock logger，避免测试输出噪音
vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

// mock backtestQueue，避免创建真实 Redis 连接的 Worker
vi.mock('../../../api/queues/backtestQueue.js', () => ({
  createBacktestWorker: vi.fn(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// mock executeOptimization，避免真实回测执行
vi.mock('../../../api/routes/backtestOptimizerRoutes.js', () => ({
  executeOptimization: vi.fn(),
}));

// mock executeGridSearch，避免真实网格搜索执行
vi.mock('../../../api/routes/tacticalGridRoutes.js', () => ({
  executeGridSearch: vi.fn(),
}));

// ===== 导入被测对象（在 mock 之后）=====

import { processBacktestJob } from '../../../api/queues/worker.js';
import { executeOptimization } from '../../../api/routes/backtestOptimizerRoutes.js';
import { executeGridSearch } from '../../../api/routes/tacticalGridRoutes.js';
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
    });
  });
});
