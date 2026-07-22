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

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';

// ===== mock 依赖（vi.mock 会被提升到顶部，先于 import 执行）=====

import { createLoggerMocks } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/engineRouteMocks.js';

// mock logger，避免测试输出噪音
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

// mock backtestQueue，避免创建真实 Redis 连接的 Worker
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  createBacktestWorker: vi.fn(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// mock executeOptimization，避免真实回测执行
vi.mock('../../../packages/backend/src/application/optimize-service.js', () => ({
  executeOptimization: vi.fn(),
}));

vi.mock('../../../packages/backend/src/application/grid-application-service.js', () => ({
  executeGridSearch: vi.fn(),
}));

// mock engineClient：提供 EngineUnavailableErrorStub 类（worker 检测该错误以触发 BullMQ 重试），
// 同时避免加载真实的 opossum 熔断器与 metrics 注册副作用。
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  EngineUnavailableError: EngineUnavailableErrorStub,
  callEngineStrict: vi.fn(),
}));

vi.mock('../../../packages/backend/src/queues/jobIdempotency.js', () => ({
  tryClaimJobProcessing: vi.fn().mockResolvedValue('claimed'),
  getProcessedJobResult: vi.fn().mockResolvedValue(null),
  markJobProcessed: vi.fn().mockResolvedValue(undefined),
  releaseJobClaim: vi.fn().mockResolvedValue(undefined),
}));

// mock backtestRunRepo（落库副作用隔离）
vi.mock('../../../packages/backend/src/repositories/backtestRunRepo.js', () => ({
  createRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
  save: vi.fn().mockResolvedValue({ id: 'run-1' }),
}));

// mock 组织查询（tenant-fair 并发上限解析）
const membershipMocks = vi.hoisted(() => ({ getOrg: vi.fn() }));
vi.mock(
  '../../../packages/backend/src/application/org/membershipService.js',
  () => membershipMocks,
);

// mock 应用层 Redis，避免真实连接 + 控制在途计数
const redisMocks = vi.hoisted(() => ({
  incr: vi.fn(),
  decr: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
  on: vi.fn(),
  ping: vi.fn().mockResolvedValue('PONG'),
  del: vi.fn().mockResolvedValue(1),
  scan: vi.fn().mockResolvedValue(['0', []]),
  set: vi.fn().mockResolvedValue('OK'),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({
  appRedis: redisMocks,
  redisConnection: {},
}));

// 拦截 process.on('SIGTERM'|'SIGINT', ...) 注册,捕获 handler 以便测试 shutdownWorker
// vi.hoisted 会在所有 import 之前执行,确保 worker.ts 模块加载时的信号注册被捕获
const signalCapture = vi.hoisted(() => {
  const captured: { SIGTERM?: () => void; SIGINT?: () => void } = {};
  const originalOn = process.on;
  process.on = ((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'SIGTERM') {
      captured.SIGTERM = handler as () => void;
      return process;
    }
    if (event === 'SIGINT') {
      captured.SIGINT = handler as () => void;
      return process;
    }
    return originalOn.call(process, event as never, handler as never);
  }) as typeof process.on;
  return { captured, originalOn };
});

afterAll(() => {
  process.on = signalCapture.originalOn;
});

// ===== 导入被测对象（在 mock 之后）=====

import { processBacktestJob } from '../../../packages/backend/src/queues/worker.js';
import { executeOptimization } from '../../../packages/backend/src/application/optimize-service.js';
import { executeGridSearch } from '../../../packages/backend/src/application/grid-application-service.js';
import {
  tryClaimJobProcessing,
  getProcessedJobResult,
  releaseJobClaim,
  markJobProcessed,
} from '../../../packages/backend/src/queues/jobIdempotency.js';
import { getOrg } from '../../../packages/backend/src/application/org/membershipService.js';
import { appRedis } from '../../../packages/backend/src/infrastructure/redisClient.js';
import { DelayedError } from 'bullmq';
import { UpstreamProblemError } from '../../../packages/backend/src/utils/errors.js';
import { createRun, save } from '../../../packages/backend/src/repositories/backtestRunRepo.js';
import type {
  BacktestJobData,
  BacktestJobResult,
} from '../../../packages/backend/src/queues/backtestQueue.js';
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

    it('already_processed 但缓存结果为 null 时应抛出 DelayedError（不返回假 completed）', async () => {
      vi.mocked(tryClaimJobProcessing).mockResolvedValueOnce('already_processed');
      vi.mocked(getProcessedJobResult).mockResolvedValueOnce(null);

      const job = makeJob({ type: 'optimizer', payload: {} });
      await expect(processBacktestJob(job)).rejects.toBeInstanceOf(DelayedError);
      expect(executeOptimization).not.toHaveBeenCalled();
      expect(releaseJobClaim).not.toHaveBeenCalled();
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

  describe('Go 引擎不可用 fail-closed（ADR-031）', () => {
    it('EngineUnavailableError 时应释放 claim 并重抛以触发 BullMQ 重试，不返回 failed', async () => {
      const err = new EngineUnavailableErrorStub('/api/engine/backtest');
      vi.mocked(executeOptimization).mockRejectedValueOnce(err);

      const job = makeJob({ type: 'optimizer', payload: {} });
      await expect(processBacktestJob(job)).rejects.toBe(err);

      // 释放 claim 使重试可重新获取处理权
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
      // 不应标记为已处理（未产生结果）
      expect(markJobProcessed).not.toHaveBeenCalled();
    });

    it('普通 Error 不应重抛，应返回 failed（区别于引擎不可用）', async () => {
      vi.mocked(executeOptimization).mockRejectedValueOnce(new Error('参数错误'));

      const job = makeJob({ type: 'optimizer', payload: {} });
      const result = await processBacktestJob(job);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('参数错误');
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
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

  describe('tenant-fair 调度 - 异常容错', () => {
    const TENANT = '11111111-1111-1111-1111-111111111111';

    it('getOrg 抛异常时应回落到 free 计划并发上限（fail-safe）', async () => {
      vi.mocked(getOrg).mockRejectedValueOnce(new Error('DB 连接失败'));
      vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
      vi.mocked(executeOptimization).mockResolvedValueOnce({ success: true, data: { ok: 1 } });

      const job = makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT });
      const result = await processBacktestJob(job);

      // free 上限为 1，incr=1 未超限，应正常处理
      expect(result.status).toBe('completed');
      expect(appRedis.decr).toHaveBeenCalledWith(`inflight:${TENANT}`);
    });

    it('Redis incr 抛异常时应跳过 fairness 门控（计数失效优于任务卡死）', async () => {
      vi.mocked(getOrg).mockResolvedValueOnce({
        orgId: TENANT,
        name: 'A',
        slug: 'a',
        plan: 'pro',
        status: 'active',
      });
      vi.mocked(appRedis.incr).mockRejectedValueOnce(new Error('Redis 连接失败'));
      vi.mocked(executeOptimization).mockResolvedValueOnce({ success: true, data: { ok: 1 } });

      const job = makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT });
      const result = await processBacktestJob(job);

      expect(result.status).toBe('completed');
      // Redis 异常时 slotAcquired=false，finally 不应释放名额
      expect(appRedis.decr).not.toHaveBeenCalled();
    });

    it('cap 超限且 decr 失败时应忽略 decr 错误并抛 DelayedError', async () => {
      vi.mocked(getOrg).mockResolvedValueOnce({
        orgId: TENANT,
        name: 'A',
        slug: 'a',
        plan: 'free',
        status: 'active',
      });
      vi.mocked(appRedis.incr).mockResolvedValueOnce(2);
      vi.mocked(appRedis.decr).mockRejectedValueOnce(new Error('Redis 关闭中'));

      const job = makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT });
      await expect(processBacktestJob(job)).rejects.toBeInstanceOf(DelayedError);
      expect(executeOptimization).not.toHaveBeenCalled();
    });

    it('releaseTenantSlot 中 decr 失败应被吞掉（finally 不抛错）', async () => {
      vi.mocked(getOrg).mockResolvedValueOnce({
        orgId: TENANT,
        name: 'A',
        slug: 'a',
        plan: 'pro',
        status: 'active',
      });
      vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
      vi.mocked(appRedis.decr).mockRejectedValueOnce(new Error('Redis 关闭中'));
      vi.mocked(executeOptimization).mockResolvedValueOnce({ success: true, data: { ok: 1 } });

      const job = makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT });
      const result = await processBacktestJob(job);

      expect(result.status).toBe('completed');
    });
  });

  describe('handleEngineError - UpstreamProblemError 分支（RO-045）', () => {
    it('UpstreamProblemError（4xx）应释放 claim 并返回 failed 而非重抛', async () => {
      const upstreamErr = new UpstreamProblemError(
        400,
        'BACKTEST_BAD_REQUEST',
        'Bad Request',
        '参数组合无效',
      );
      vi.mocked(executeOptimization).mockRejectedValueOnce(upstreamErr);

      const job = makeJob({ type: 'optimizer', payload: {} });
      const result = await processBacktestJob(job);

      expect(result.status).toBe('failed');
      expect(result.error).toBe('参数组合无效');
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
      // 4xx 不应标记为已处理（未产生结果）
      expect(markJobProcessed).not.toHaveBeenCalled();
    });
  });

  describe('dispatchJob - DelayedError 透传', () => {
    it('handler 抛 DelayedError 时应直接重抛（不调用 handleEngineError）', async () => {
      vi.mocked(executeOptimization).mockRejectedValueOnce(new DelayedError('内部延迟'));

      const job = makeJob({ type: 'optimizer', payload: {} });
      await expect(processBacktestJob(job)).rejects.toBeInstanceOf(DelayedError);
      // DelayedError 直接重抛，不应触发 handleEngineError 的 releaseJobClaim
      expect(releaseJobClaim).not.toHaveBeenCalled();
    });
  });

  describe('persistRunIfTenant - 落库容错', () => {
    const TENANT = '11111111-1111-1111-1111-111111111111';

    it('save 失败时应仅告警，不影响任务结果', async () => {
      vi.mocked(getOrg).mockResolvedValueOnce({
        orgId: TENANT,
        name: 'A',
        slug: 'a',
        plan: 'pro',
        status: 'active',
      });
      vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
      vi.mocked(executeOptimization).mockResolvedValueOnce({ success: true, data: { ok: 1 } });
      vi.mocked(save).mockRejectedValueOnce(new Error('Postgres 连接失败'));

      const job = makeJob({
        type: 'optimizer',
        payload: { portfolio: { assets: [] } },
        tenantId: TENANT,
        ownerUserId: 'user-1',
      });
      const result = await processBacktestJob(job);

      expect(result.status).toBe('completed');
      // save 接收 (tenantId, Run) ——Run 聚合根已驱动 create→start→complete
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(TENANT, expect.objectContaining({ id: 'job-1' }));
      // createRun 不应被调用（已被 save 替代）
      expect(createRun).not.toHaveBeenCalled();
    });
  });
});

describe('shutdownWorker 与信号处理（优雅关闭）', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let workerCloseMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    workerCloseMock = vi.fn().mockResolvedValue(undefined);

    // 用 vi.doMock 覆盖顶层 vi.mock,使每次动态导入拿到受控的 worker.close mock
    vi.doMock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
      createBacktestWorker: () => ({ close: workerCloseMock }),
    }));

    // 重置模块缓存 + 动态导入,获取 fresh workerShuttingDown=false 的模块实例
    // 信号 handler 会被 signalCapture(vi.hoisted) 捕获,无需真实注册到 process
    vi.resetModules();
    await import('../../../packages/backend/src/queues/worker.js');

    vi.useFakeTimers();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    exitSpy.mockRestore();
    vi.doUnmock('../../../packages/backend/src/queues/backtestQueue.js');
    vi.resetModules();
  });

  it('SIGTERM 正常关闭 + SIGINT 重复信号提前返回（覆盖信号注册与 shutdownWorker 主路径）', async () => {
    // SIGTERM 正常路径:worker.close() 调用 + process.exit(0)
    signalCapture.captured.SIGTERM!();
    await vi.runAllTimersAsync();

    expect(workerCloseMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    // SIGINT 重复信号:workerShuttingDown=true,提前返回,不再调用 worker.close
    workerCloseMock.mockClear();
    exitSpy.mockClear();

    signalCapture.captured.SIGINT!();
    await vi.runAllTimersAsync();

    expect(workerCloseMock).not.toHaveBeenCalled();
  });

  it('worker.close() 抛异常 - 异常被吞且 process.exit(0) 仍被调用（容错路径）', async () => {
    workerCloseMock.mockRejectedValueOnce(new Error('close failed'));

    signalCapture.captured.SIGTERM!();
    await vi.runAllTimersAsync();

    expect(workerCloseMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('forceExitTimeout 30s - worker.close() 不 resolve 时 process.exit(1)（兜底路径）', async () => {
    // worker.close() 永不 resolve,模拟 worker.close() 因长任务挂起
    workerCloseMock.mockReturnValueOnce(new Promise<void>(() => {}));

    signalCapture.captured.SIGTERM!();
    // 推进 30s 触发 forceExitTimeout
    await vi.advanceTimersByTimeAsync(30000);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
