import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import type { MockInstance } from 'vitest';
import '../../helpers/loggerMock.js';
import { redisModuleMock } from '../../helpers/redisFixture.js';
import { engineMocks } from '../../helpers/engineFixture.js';
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  createBacktestWorker: vi.fn(() => ({ close: vi.fn().mockResolvedValue(undefined) })),
}));
vi.mock('../../../packages/backend/src/application/optimize-service.js', () => ({
  executeOptimization: vi.fn(),
}));
vi.mock('../../../packages/backend/src/application/grid-application-service.js', () => ({
  executeGridSearch: vi.fn(),
}));
vi.mock('../../../packages/backend/src/application/backtest-service.js', () => ({
  runPortfolioBacktest: vi.fn(),
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => engineMocks);
vi.mock('../../../packages/backend/src/queues/queueUtils.js', () => ({
  tryClaimJobProcessing: vi.fn().mockResolvedValue('claimed'),
  getProcessedJobResult: vi.fn().mockResolvedValue(null),
  markJobProcessed: vi.fn().mockResolvedValue(undefined),
  releaseJobClaim: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../packages/backend/src/repositories/backtestRunRepo.js', () => ({
  createRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
  save: vi.fn().mockResolvedValue({ id: 'run-1' }),
}));
const membershipMocks = vi.hoisted(() => ({ getOrg: vi.fn() }));
vi.mock(
  '../../../packages/backend/src/application/org/membershipService.js',
  () => membershipMocks,
);
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => redisModuleMock);
const signalCapture = vi.hoisted(() => {
  const captured: { SIGTERM?: () => void; SIGINT?: () => void } = {};
  const originalOn = process.on;
  process.on = ((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'SIGTERM' || event === 'SIGINT') {
      captured[event] = handler as () => void;
      return process;
    }
    return originalOn.call(process, event as never, handler as never);
  }) as typeof process.on;
  return { captured, originalOn };
});
afterAll(() => {
  process.on = signalCapture.originalOn;
});
import { processBacktestJob } from '../../../packages/backend/src/queues/worker.js';
import { executeOptimization } from '../../../packages/backend/src/application/optimize-service.js';
import { executeGridSearch } from '../../../packages/backend/src/application/grid-application-service.js';
import {
  tryClaimJobProcessing,
  getProcessedJobResult,
  releaseJobClaim,
  markJobProcessed,
} from '../../../packages/backend/src/queues/queueUtils.js';
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
function makeJob(data: BacktestJobData, id = 'job-1'): Job<BacktestJobData> {
  return {
    id,
    data,
    token: 'tok',
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<BacktestJobData>;
}
const TENANT = '11111111-1111-1111-1111-111111111111',
  inflightKey = `inflight:${TENANT}`;
function mockOrg(plan = 'pro') {
  vi.mocked(getOrg).mockResolvedValueOnce({
    orgId: TENANT,
    name: 'A',
    slug: 'a',
    plan,
    status: 'active',
  });
}
function mockOptSuccess() {
  vi.mocked(executeOptimization).mockResolvedValueOnce({
    success: true,
    data: { ok: 1 },
  } as Awaited<ReturnType<typeof executeOptimization>>);
}

describe('processBacktestJob - 任务分发', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  const gridOk = { success: true, data: { totalCombinations: 4, topResults: [] } };
  const gridFail = { success: false, error: '参数组合过多(250)，请缩小参数范围（上限200）' };
  const optOk = { success: true, data: { results: [], totalCombinations: 10 } };
  const optFail = { success: false, error: '优化失败' };
  it.each<[string, BacktestJobData['type'], unknown]>([
    ['grid-search 成功时返回 completed', 'grid-search', gridOk],
    ['grid-search 返回 success:false 时仍将完整结果作为 result', 'grid-search', gridFail],
    ['optimizer 成功时返回 completed', 'optimizer', optOk],
    ['optimizer 返回 success:false 时仍将完整结果作为 result', 'optimizer', optFail],
  ])('%s', async (_n, type, mockResult) => {
    const target = type === 'optimizer' ? executeOptimization : executeGridSearch;
    vi.mocked(target).mockResolvedValueOnce(mockResult as never);
    const job = makeJob({ type, payload: { indicator: 'sma' } } as BacktestJobData);
    const result = await processBacktestJob(job);
    expect(target).toHaveBeenCalledWith(job.data.payload);
    expect(result.status).toBe('completed');
    expect(result.result).toEqual(mockResult);
  });
  it('handler 抛瞬时错误（非 4xx）时应释放 claim 并重抛以触发 BullMQ 重试', async () => {
    const err = new Error('Redis 连接失败');
    vi.mocked(executeGridSearch).mockRejectedValueOnce(err);
    const job = makeJob({ type: 'grid-search', payload: { indicator: 'sma' } } as BacktestJobData);
    await expect(processBacktestJob(job)).rejects.toBe(err);
    expect(releaseJobClaim).toHaveBeenCalledWith('job-1', 'grid-search');
    expect(markJobProcessed).not.toHaveBeenCalled();
  });
  it('未知任务类型应返回 failed 且 error 包含未知类型名', async () => {
    const job = makeJob({ type: 'unknown-type' as BacktestJobData['type'], payload: {} });
    const result = await processBacktestJob(job);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Unknown job type');
    expect(result.error).toContain('unknown-type');
    expect(executeGridSearch).not.toHaveBeenCalled();
    expect(executeOptimization).not.toHaveBeenCalled();
    expect(releaseJobClaim).toHaveBeenCalledWith('job-1', 'unknown-type');
  });
  it.each([
    [
      'already_processed 且有缓存时应返回缓存结果',
      'already_processed',
      { score: 0.9 },
      'completed',
    ],
    [
      'already_processed 但缓存结果为 null 时应抛出 DelayedError',
      'already_processed',
      null,
      'delayed',
    ],
  ])('%s', async (_n, claim, cached, expected) => {
    vi.mocked(tryClaimJobProcessing).mockResolvedValueOnce(claim as never);
    if (cached !== null) vi.mocked(getProcessedJobResult).mockResolvedValueOnce(cached);
    if (expected === 'completed') {
      const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {} }));
      expect(result).toEqual<BacktestJobResult>({ status: 'completed', result: { score: 0.9 } });
    } else {
      const job = makeJob({ type: 'optimizer', payload: {} });
      await expect(processBacktestJob(job)).rejects.toBeInstanceOf(DelayedError);
      expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'tok');
      expect(releaseJobClaim).not.toHaveBeenCalled();
      expect(markJobProcessed).not.toHaveBeenCalled();
    }
    expect(executeOptimization).not.toHaveBeenCalled();
  });
  it('in_progress 应接管陈旧占位并继续处理（BullMQ 单投递保证原处理者已崩溃）', async () => {
    vi.mocked(tryClaimJobProcessing).mockResolvedValueOnce('in_progress');
    mockOptSuccess();
    const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {} }));
    expect(result).toEqual<BacktestJobResult>({
      status: 'completed',
      result: { success: true, data: { ok: 1 } },
    });
    expect(executeOptimization).toHaveBeenCalled();
    expect(markJobProcessed).toHaveBeenCalledWith('job-1', 'optimizer', {
      success: true,
      data: { ok: 1 },
    });
  });
  const engineDown = new engineMocks.EngineUnavailableError('/api/engine/backtest');
  it.each([
    ['EngineUnavailableError 时应释放 claim 并重抛以触发 BullMQ 重试', engineDown, true],
    ['handler 抛 DelayedError 时应直接重抛（不释放 claim）', new DelayedError('内部延迟'), false],
  ])('%s', async (_n, err, releaseExpected) => {
    vi.mocked(executeOptimization).mockRejectedValueOnce(err as never);
    await expect(processBacktestJob(makeJob({ type: 'optimizer', payload: {} }))).rejects.toBe(err);
    if (releaseExpected) expect(releaseJobClaim).toHaveBeenCalledWith('job-1', 'optimizer');
    else expect(releaseJobClaim).not.toHaveBeenCalled();
  });
  it('UpstreamProblemError（4xx）应释放 claim 并返回 failed 而非重抛', async () => {
    vi.mocked(executeOptimization).mockRejectedValueOnce(
      new UpstreamProblemError(400, 'BACKTEST_BAD_REQUEST', 'Bad Request', '参数组合无效'),
    );
    const result = await processBacktestJob(makeJob({ type: 'optimizer', payload: {} }));
    expect(result.status).toBe('failed');
    expect(result.error).toBe('参数组合无效');
    expect(releaseJobClaim).toHaveBeenCalledWith('job-1', 'optimizer');
    expect(markJobProcessed).not.toHaveBeenCalled();
  });

  describe('tenant-fair 调度（ADR-010）', () => {
    const noop = () => {},
      noIncr = () => expect(appRedis.incr).not.toHaveBeenCalled(),
      noDecr = () => expect(appRedis.decr).not.toHaveBeenCalled(),
      decrCheck = () => expect(appRedis.decr).toHaveBeenCalledWith(inflightKey),
      slotCheck = () => {
        expect(appRedis.incr).toHaveBeenCalledWith(inflightKey);
        expect(appRedis.decr).toHaveBeenCalledWith(inflightKey);
      },
      proSlot = () => {
        mockOrg('pro');
        vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
      },
      orgFails = () => {
        vi.mocked(getOrg).mockRejectedValueOnce(new Error('DB 连接失败'));
        vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
      },
      incrFails = () => {
        mockOrg('pro');
        vi.mocked(appRedis.incr).mockRejectedValueOnce(new Error('Redis 连接失败'));
      },
      decrFailsSetup = () => {
        proSlot();
        vi.mocked(appRedis.decr).mockRejectedValueOnce(new Error('Redis 关闭中'));
      };
    it.each<[string, string | undefined, () => void, () => void]>([
      ['未携带 tenantId 时跳过在途门控（不触碰 Redis）', undefined, noop, noIncr],
      ['在途数未超上限时正常处理并释放名额', TENANT, proSlot, slotCheck],
      ['getOrg 抛异常时应回落到 free 计划并发上限（fail-safe）', TENANT, orgFails, decrCheck],
      ['Redis incr 抛异常时应跳过 fairness 门控', TENANT, incrFails, noDecr],
      ['releaseTenantSlot 中 decr 失败应被吞掉（finally 不抛错）', TENANT, decrFailsSetup, noop],
    ])('%s', async (_n, tenantId, setup, check) => {
      setup();
      mockOptSuccess();
      const result = await processBacktestJob(
        makeJob({ type: 'optimizer', payload: {}, tenantId } as BacktestJobData),
      );
      expect(result.status).toBe('completed');
      check();
    });
  });
  it.each([
    ['在途数超过计划上限时抛 DelayedError 并回退计数', false],
    ['cap 超限且 decr 失败时应忽略 decr 错误并抛 DelayedError', true],
  ])('%s', async (_n, decrFails) => {
    mockOrg('free');
    vi.mocked(appRedis.incr).mockResolvedValueOnce(2);
    if (decrFails) vi.mocked(appRedis.decr).mockRejectedValueOnce(new Error('Redis 关闭中'));
    const job = makeJob({ type: 'optimizer', payload: {}, tenantId: TENANT });
    await expect(processBacktestJob(job)).rejects.toBeInstanceOf(DelayedError);
    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'tok');
    expect(appRedis.decr).toHaveBeenCalledWith(inflightKey);
    expect(executeOptimization).not.toHaveBeenCalled();
    expect(tryClaimJobProcessing).not.toHaveBeenCalled();
  });

  it('save 失败时应仅告警，不影响任务结果', async () => {
    mockOrg('pro');
    vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
    mockOptSuccess();
    vi.mocked(save).mockRejectedValueOnce(new Error('Postgres 连接失败'));
    const result = await processBacktestJob(
      makeJob({
        type: 'optimizer',
        payload: { portfolio: { assets: [] } },
        tenantId: TENANT,
        ownerUserId: 'user-1',
      }),
    );
    expect(result.status).toBe('completed');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(TENANT, expect.objectContaining({ id: 'job-1' }));
    expect(createRun).not.toHaveBeenCalled();
  });
  it('handler 返回 success:false 时仍将完整结果落库', async () => {
    mockOrg('pro');
    vi.mocked(appRedis.incr).mockResolvedValueOnce(1);
    vi.mocked(executeGridSearch).mockResolvedValueOnce({ success: false, error: '参数组合过多' });
    await processBacktestJob(
      makeJob({ type: 'grid-search', payload: { indicator: 'sma' }, tenantId: TENANT }),
    );
    const run = vi.mocked(save).mock.calls[0][1];
    expect(run.id).toBe('job-1');
    expect(run.status).toBe('completed');
    expect(run.result).toEqual({ success: false, error: '参数组合过多' });
  });
});
describe('shutdownWorker（优雅关闭）', () => {
  let exitSpy: MockInstance<typeof process.exit>;
  let workerCloseMock: ReturnType<typeof vi.fn>;
  let workerModule: typeof import('../../../packages/backend/src/queues/worker.js');
  beforeEach(async () => {
    workerCloseMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
      createBacktestWorker: () => ({ close: workerCloseMock }),
    }));
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
