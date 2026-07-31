import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/backtestRoutesFixtures.js';

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({ createBacktestWorker: vi.fn(() => ({ close: vi.fn().mockResolvedValue(undefined) })) }));
vi.mock('../../../packages/backend/src/application/optimize-service.js', () => ({ executeOptimization: vi.fn() }));
vi.mock('../../../packages/backend/src/application/grid-application-service.js', () => ({ executeGridSearch: vi.fn() }));
vi.mock('../../../packages/backend/src/application/backtest-service.js', () => ({ runPortfolioBacktest: vi.fn() }));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({ EngineUnavailableError: EngineUnavailableErrorStub, callEngineStrict: vi.fn() }));
vi.mock('../../../packages/backend/src/queues/jobIdempotency.js', () => ({
  tryClaimJobProcessing: vi.fn().mockResolvedValue('claimed'),
  getProcessedJobResult: vi.fn().mockResolvedValue(null),
  markJobProcessed: vi.fn().mockResolvedValue(undefined),
  releaseJobClaim: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../packages/backend/src/repositories/backtestRunRepo.js', () => ({ createRun: vi.fn().mockResolvedValue({ id: 'run-1' }), save: vi.fn().mockResolvedValue({ id: 'run-1' }) }));
const membershipMocks = vi.hoisted(() => ({ getOrg: vi.fn() }));
vi.mock('../../../packages/backend/src/application/org/membershipService.js', () => membershipMocks);
const redisMocks = vi.hoisted(() => ({
  incr: vi.fn(), decr: vi.fn().mockResolvedValue(0), expire: vi.fn().mockResolvedValue(1),
  on: vi.fn(), ping: vi.fn().mockResolvedValue('PONG'), del: vi.fn().mockResolvedValue(1),
  scan: vi.fn().mockResolvedValue(['0', []]), set: vi.fn().mockResolvedValue('OK'),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => ({ appRedis: redisMocks, redisConnection: {} }));
const signalCapture = vi.hoisted(() => {
  const captured: { SIGTERM?: () => void; SIGINT?: () => void } = {};
  const originalOn = process.on;
  process.on = ((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'SIGTERM') { captured.SIGTERM = handler as () => void; return process; }
    if (event === 'SIGINT') { captured.SIGINT = handler as () => void; return process; }
    return originalOn.call(process, event as never, handler as never);
  }) as typeof process.on;
  return { captured, originalOn };
});
afterAll(() => { process.on = signalCapture.originalOn; });

import { processBacktestJob } from '../../../packages/backend/src/queues/worker.js';
import { executeOptimization } from '../../../packages/backend/src/application/optimize-service.js';
import { executeGridSearch } from '../../../packages/backend/src/application/grid-application-service.js';
import { tryClaimJobProcessing, getProcessedJobResult, releaseJobClaim, markJobProcessed } from '../../../packages/backend/src/queues/jobIdempotency.js';
import { getOrg } from '../../../packages/backend/src/application/org/membershipService.js';
import { appRedis } from '../../../packages/backend/src/infrastructure/redisClient.js';
import { DelayedError } from 'bullmq';
import { UpstreamProblemError } from '../../../packages/backend/src/utils/errors.js';
import { createRun, save } from '../../../packages/backend/src/repositories/backtestRunRepo.js';
import type { BacktestJobData, BacktestJobResult } from '../../../packages/backend/src/queues/backtestQueue.js';
import type { Job } from 'bullmq';

function makeJob(data: BacktestJobData, id = 'job-1'): Job<BacktestJobData> { return { id, data } as unknown as Job<BacktestJobData>; }
const TENANT = '11111111-1111-1111-1111-111111111111';
function mockOrg(plan = 'pro') { vi.mocked(getOrg).mockResolvedValueOnce({ orgId: TENANT, name: 'A', slug: 'a', plan, status: 'active' }); }
function mockOptSuccess() { vi.mocked(executeOptimization).mockResolvedValueOnce({ success: true, data: { ok: 1 } }); }

describe('processBacktestJob - 任务分发', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  describe('grid-search 任务类型', () => {
    it('应调用 executeGridSearch 并在成功时返回 completed', async () => {
      const mockResult = { success: true, data: { totalCombinations: 4, topResults: [] } };
      vi.mocked(executeGridSearch).mockResolvedValueOnce(mockResult);
      const job = makeJob({ type: 'grid-search', payload: { indicator: 'sma', tickers: ['AAPL'] } });
      const result = await processBacktestJob(job);
      expect(executeGridSearch).toHaveBeenCalledTimes(1);
      expect(executeGridSearch).toHaveBeenCalledWith(job.data.payload);
      expect(result).toEqual<BacktestJobResult>({ status: 'completed', result: mockResult.data });
    });
    it('executeGridSearch 返回失败时应返回 failed', async () => {
      vi.mocked(executeGridSearch).mockResolvedValueOnce({ success: false, error: '参数组合过多(250)，请缩小参数范围（上限200）' });
      const result = await processBacktestJob(makeJob({ type: 'grid-search', payload: { indicator: 'rsi' } }));
      expect(result.status).toBe('failed');
      expect(result.error).toContain('参数组合过多');
    });
    it('executeGridSearch 抛异常时应捕获并返回 failed', async () => {
      vi.mocked(executeGridSearch).mockRejectedValueOnce(new Error('Redis 连接失败'));
      const result = await processBacktestJob(makeJob({ type: 'grid-search', payload: { indicator: 'ema' } }));
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Redis 连接失败');
    });
  });
  describe('optimizer 任务类型（回归保护）', () => {
    it('应调用 executeOptimization 并在成功时返回 completed', async () => {
      vi.mocked(executeOptimization).mockResolvedValueOnce({ success: true, data: { results: [], totalCombinations: 10 } });
      const job = makeJob({ type: 'optimizer', payload: { portfolio: { assets: [] } } });
      const result = await processBacktestJob(job);
      expect(executeOptimization).toHaveBeenCalledTimes(1);
      expect(executeOptimization).toHaveBeenCalledWith(job.data.payload);
      expect(result.status).toBe('completed');
    });
  });
  describe('未知任务类型', () => {
    it('应返回 failed 且 error 包含未知类型名', async () => {
      const job = makeJob({ type: 'unknown-type' as BacktestJobData['type'], payload: {} });
      const result = await processBacktestJob(job);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('Unknown job type');
      expect(result.error).toContain('unknown-type');
      expect(executeGridSearch).not.toHaveBeenCalled();
      expect(executeOptimization).not.toHaveBeenCalled();
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
    });
  });
  describe('幂等守卫', () => {
    it('already_processed 且有缓存时应返回缓存结果', async () => {
      vi.mocked(tryClaimJobProcessing).mockResolvedValueOnce('already_processed');
      vi.mocked(getProcessedJobResult).mockResolvedValueOnce({ score: 0.9 });
      const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {} }));
      expect(result).toEqual<BacktestJobResult>({ status: 'completed', result: { score: 0.9 } });
      expect(executeOptimization).not.toHaveBeenCalled();
    });
    it('in_progress 时应抛出 DelayedError 而非假 completed', async () => {
      vi.mocked(tryClaimJobProcessing).mockResolvedValueOnce('in_progress');
      await expect(processBacktestJob(makeJob({ type: 'optimizer', payload: {} }))).rejects.toBeInstanceOf(DelayedError);
      expect(executeOptimization).not.toHaveBeenCalled();
      expect(releaseJobClaim).not.toHaveBeenCalled();
      expect(markJobProcessed).not.toHaveBeenCalled();
    });
    it('already_processed 但缓存结果为 null 时应抛出 DelayedError', async () => {
      vi.mocked(tryClaimJobProcessing).mockResolvedValueOnce('already_processed');
      vi.mocked(getProcessedJobResult).mockResolvedValueOnce(null);
      await expect(processBacktestJob(makeJob({ type: 'optimizer', payload: {} }))).rejects.toBeInstanceOf(DelayedError);
      expect(executeOptimization).not.toHaveBeenCalled();
      expect(releaseJobClaim).not.toHaveBeenCalled();
    });
  });
  describe('releaseJobClaim 失败路径', () => {
    it.each([
      ['executeOptimization 失败时', 'optimizer', { success: false, error: '优化失败' }],
      ['executeGridSearch 失败时', 'grid-search', { success: false, error: '网格搜索失败' }],
    ])('%s应释放 claim', async (_n, type, mockResult) => {
      vi.mocked(type === 'optimizer' ? executeOptimization : executeGridSearch).mockResolvedValueOnce(mockResult as never);
      const result = await processBacktestJob(makeJob({ type: type as BacktestJobData['type'], payload: {} }));
      expect(result.status).toBe('failed');
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
      expect(markJobProcessed).not.toHaveBeenCalled();
    });
    it('executeGridSearch 抛异常时应释放 claim', async () => {
      vi.mocked(executeGridSearch).mockRejectedValueOnce(new Error('Redis 连接失败'));
      await processBacktestJob(makeJob({ type: 'grid-search', payload: {} }));
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
      expect(markJobProcessed).not.toHaveBeenCalled();
    });
  });
  describe('Go 引擎不可用 fail-closed（ADR-031）', () => {
    it('EngineUnavailableError 时应释放 claim 并重抛以触发 BullMQ 重试', async () => {
      const err = new EngineUnavailableErrorStub('/api/engine/backtest');
      vi.mocked(executeOptimization).mockRejectedValueOnce(err);
      await expect(processBacktestJob(makeJob({ type: 'optimizer', payload: {} }))).rejects.toBe(err);
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
      expect(markJobProcessed).not.toHaveBeenCalled();
    });
    it('普通 Error 不应重抛，应返回 failed', async () => {
      vi.mocked(executeOptimization).mockRejectedValueOnce(new Error('参数错误'));
      const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {} }));
      expect(result.status).toBe('failed');
      expect(result.error).toBe('参数错误');
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
    });
  });
  describe('tenant-fair 调度（ADR-037）', () => {
    it('未携带 tenantId 时跳过在途门控（不触碰 Redis）', async () => {
      mockOptSuccess();
      const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {} }));
      expect(result.status).toBe('completed');
      expect(appRedis.incr).not.toHaveBeenCalled();
    });
    it('在途数未超上限时正常处理并释放名额', async () => {
      mockOrg('pro');
      vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
      mockOptSuccess();
      const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT }));
      expect(result.status).toBe('completed');
      expect(appRedis.incr).toHaveBeenCalledWith(`inflight:${TENANT}`);
      expect(appRedis.decr).toHaveBeenCalledWith(`inflight:${TENANT}`);
    });
    it('在途数超过计划上限时抛 DelayedError 并回退计数', async () => {
      mockOrg('free');
      vi.mocked(appRedis.incr).mockResolvedValueOnce(2);
      await expect(processBacktestJob(makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT }))).rejects.toBeInstanceOf(DelayedError);
      expect(appRedis.decr).toHaveBeenCalledWith(`inflight:${TENANT}`);
      expect(executeOptimization).not.toHaveBeenCalled();
      expect(tryClaimJobProcessing).not.toHaveBeenCalled();
    });
  });
  describe('tenant-fair 调度 - 异常容错', () => {
    it('getOrg 抛异常时应回落到 free 计划并发上限（fail-safe）', async () => {
      vi.mocked(getOrg).mockRejectedValueOnce(new Error('DB 连接失败'));
      vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
      mockOptSuccess();
      const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT }));
      expect(result.status).toBe('completed');
      expect(appRedis.decr).toHaveBeenCalledWith(`inflight:${TENANT}`);
    });
    it('Redis incr 抛异常时应跳过 fairness 门控', async () => {
      mockOrg('pro');
      vi.mocked(appRedis.incr).mockRejectedValueOnce(new Error('Redis 连接失败'));
      mockOptSuccess();
      const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT }));
      expect(result.status).toBe('completed');
      expect(appRedis.decr).not.toHaveBeenCalled();
    });
    it('cap 超限且 decr 失败时应忽略 decr 错误并抛 DelayedError', async () => {
      mockOrg('free');
      vi.mocked(appRedis.incr).mockResolvedValueOnce(2);
      vi.mocked(appRedis.decr).mockRejectedValueOnce(new Error('Redis 关闭中'));
      await expect(processBacktestJob(makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT }))).rejects.toBeInstanceOf(DelayedError);
      expect(executeOptimization).not.toHaveBeenCalled();
    });
    it('releaseTenantSlot 中 decr 失败应被吞掉（finally 不抛错）', async () => {
      mockOrg('pro');
      vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
      vi.mocked(appRedis.decr).mockRejectedValueOnce(new Error('Redis 关闭中'));
      mockOptSuccess();
      const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT }));
      expect(result.status).toBe('completed');
    });
  });
  describe('handleEngineError - UpstreamProblemError 分支（RO-045）', () => {
    it('UpstreamProblemError（4xx）应释放 claim 并返回 failed 而非重抛', async () => {
      vi.mocked(executeOptimization).mockRejectedValueOnce(new UpstreamProblemError(400, 'BACKTEST_BAD_REQUEST', 'Bad Request', '参数组合无效'));
      const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {} }));
      expect(result.status).toBe('failed');
      expect(result.error).toBe('参数组合无效');
      expect(releaseJobClaim).toHaveBeenCalledWith('job-1');
      expect(markJobProcessed).not.toHaveBeenCalled();
    });
  });
  describe('dispatchJob - DelayedError 透传', () => {
    it('handler 抛 DelayedError 时应直接重抛', async () => {
      vi.mocked(executeOptimization).mockRejectedValueOnce(new DelayedError('内部延迟'));
      await expect(processBacktestJob(makeJob({ type: 'optimizer', payload: {} }))).rejects.toBeInstanceOf(DelayedError);
      expect(releaseJobClaim).not.toHaveBeenCalled();
    });
  });
  describe('persistRunIfTenant - 落库容错', () => {
    it('save 失败时应仅告警，不影响任务结果', async () => {
      mockOrg('pro');
      vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
      mockOptSuccess();
      vi.mocked(save).mockRejectedValueOnce(new Error('Postgres 连接失败'));
      const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: { portfolio: { assets: [] } }, tenantId: TENANT, ownerUserId: 'user-1' }));
      expect(result.status).toBe('completed');
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(TENANT, expect.objectContaining({ id: 'job-1' }));
      expect(createRun).not.toHaveBeenCalled();
    });
  });
});

describe('shutdownWorker（优雅关闭）', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let workerCloseMock: ReturnType<typeof vi.fn>;
  let workerModule: typeof import('../../../packages/backend/src/queues/worker.js');
  beforeEach(async () => {
    workerCloseMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../../packages/backend/src/queues/backtestQueue.js', () => ({ createBacktestWorker: () => ({ close: workerCloseMock }) }));
    vi.resetModules();
    workerModule = await import('../../../packages/backend/src/queues/worker.js');
    vi.useFakeTimers();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    exitSpy.mockRestore();
    vi.doUnmock('../../../packages/backend/src/queues/backtestQueue.js');
    vi.resetModules();
  });
  it('shutdownWorker 正常关闭 + 重复调用提前返回', async () => {
    await workerModule.shutdownWorker('SIGTERM');
    await vi.runAllTimersAsync();
    expect(workerCloseMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
    workerCloseMock.mockClear();
    exitSpy.mockClear();
    await workerModule.shutdownWorker('SIGINT');
    await vi.runAllTimersAsync();
    expect(workerCloseMock).not.toHaveBeenCalled();
  });
  it('worker.close() 抛异常 - 异常被吞且 process.exit 不被调用', async () => {
    workerCloseMock.mockRejectedValueOnce(new Error('close failed'));
    await workerModule.shutdownWorker('SIGTERM');
    await vi.runAllTimersAsync();
    expect(workerCloseMock).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });
  it('forceExitTimeout 30s - worker.close() 不 resolve 时 process.exit(1)', async () => {
    workerCloseMock.mockReturnValueOnce(new Promise<void>(() => {}));
    void workerModule.shutdownWorker('SIGTERM');
    await vi.advanceTimersByTimeAsync(30000);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
