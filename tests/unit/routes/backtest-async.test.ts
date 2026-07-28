/**
 * P0-03 回测任务异步化 — 后端路由单元测试
 *
 * 覆盖端点：
 * - POST /api/backtest/portfolio -> 202 Accepted（异步默认路径，P0-02 统一）
 * - POST /api/backtest/portfolio + X-Backtest-Sync: true -> 202（同步路径已废弃）
 * - POST /api/backtest/portfolio -> 503 + Retry-After（队列不可用 fail-closed，ADR-031）
 * - GET  /api/backtest/runs/:jobId -> 200/404（任务状态查询）
 *
 * 共享 mock 实现配置见 tests/helpers/backtestRoutesFixtures.ts。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockLogger, createConfigMocks } from '../../helpers/mockFactories.js';
import backtestRoutes from '../../../packages/backend/src/routes/backtestRoutes.js';
import {
  configurePortfolioBacktestMocks,
  configureTickerHelpersMocks,
  createValidRequestBody,
  setupPortfolioServer,
  type BacktestMockHandles,
} from '../../helpers/backtestRoutesFixtures.js';

// ===== vi.hoisted: mock 句柄 =====

const m = vi.hoisted<BacktestMockHandles>(() => ({
  runBacktest: vi.fn(),
  runPortfolioBacktest: vi.fn(),
  runAnalysis: vi.fn(),
  runMonteCarlo: vi.fn(),
  runOptimization: vi.fn(),
  runEfficientFrontier: vi.fn(),
  fetchHistoryData: vi.fn(),
  searchTickers: vi.fn(),
  callEngineStrict: vi.fn(),
  buildEngineParams: vi.fn(),
  preparePortfolioBacktest: vi.fn(),
  collectInvalidTickerWarnings: vi.fn(),
  collectTickersFromPortfolios: vi.fn(),
  filterPriceData: vi.fn(),
  fetchPriceData: vi.fn(),
  loadMacroData: vi.fn(),
  validateTickers: vi.fn(),
  portfolioToDomain: vi.fn(),
  sanitizeMcParams: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
}));

// P0-03: backtestQueue mock — add/getJob 行为由各测试用例单独设置
const queueMocks = vi.hoisted(() => ({
  add: vi.fn(),
  getJob: vi.fn(),
}));

// ===== vi.mock: 工厂引用 hoisted 句柄 =====

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
  httpLogger: vi.fn(),
}));
vi.mock('../../../packages/backend/src/application/backtest-service.js', () => ({
  runPortfolioBacktest: m.runPortfolioBacktest,
  runBacktest: m.runBacktest,
}));
vi.mock('../../../packages/backend/src/application/analysis-orchestrator.js', () => ({
  runAnalysis: m.runAnalysis,
}));
vi.mock('../../../packages/backend/src/application/montecarlo-service.js', () => ({
  runMonteCarlo: m.runMonteCarlo,
}));
vi.mock('../../../packages/backend/src/application/optimize-service.js', () => ({
  runOptimization: m.runOptimization,
  runEfficientFrontier: m.runEfficientFrontier,
}));
vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  searchTickers: m.searchTickers,
  fetchHistoryData: m.fetchHistoryData,
  validateTickers: m.validateTickers,
  initDb: vi.fn(),
  invalidateCache: vi.fn(),
}));
vi.mock('../../../packages/backend/src/application/backtest-helpers.js', () => ({
  preparePortfolioBacktest: m.preparePortfolioBacktest,
  collectInvalidTickerWarnings: m.collectInvalidTickerWarnings,
  collectTickersFromPortfolios: m.collectTickersFromPortfolios,
  filterPriceData: m.filterPriceData,
  fetchPriceData: m.fetchPriceData,
  loadMacroData: m.loadMacroData,
  sanitizeMcParams: m.sanitizeMcParams,
  validateTickers: m.validateTickers,
  translateDomainError: vi.fn(<T>(fn: () => T): T => fn()),
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: m.callEngineStrict,
  EngineUnavailableError: class MockEngineUnavailableError extends Error {
    readonly retryAfterSeconds = 30;
    readonly code = 'ENGINE_UNAVAILABLE';
    constructor(message = '计算引擎暂不可用') {
      super(message);
      this.name = 'EngineUnavailableError';
    }
  },
  resetEngineAvailability: vi.fn(),
}));
vi.mock('../../../packages/backend/src/application/backtest/engineBodyBuilder.js', () => ({
  buildEngineParams: m.buildEngineParams,
}));
vi.mock('../../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: {
    add: queueMocks.add,
    getJob: queueMocks.getJob,
  },
}));
vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: createConfigMocks(),
  validateConfig: vi.fn(),
}));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () => {
  const noop = () => {};
  return {
    redisConnection: { on: noop },
    appRedis: {
      on: noop,
      ping: async () => 'PONG',
      set: async () => 'OK',
      get: async () => null,
      scan: async () => ['0', []] as [string, string[]],
      del: async () => 0,
    },
    getRedisHealth: vi.fn().mockResolvedValue(true),
    markRedisUnhealthy: vi.fn(),
  };
});
vi.mock('fs', () => ({
  default: fsMocks,
  existsSync: fsMocks.existsSync,
  readFileSync: fsMocks.readFileSync,
}));

// ===== 注入 mock 实现 =====
configurePortfolioBacktestMocks(m);
configureTickerHelpersMocks(m);

// ===== 测试用 BullMQ Job mock 工厂 =====

/**
 * 创建一个模拟的 BullMQ Job 对象，用于 GET /runs/:jobId 测试。
 *
 * @param overrides - 覆盖默认值的属性
 * @returns 模拟的 job 对象
 */
function createMockJob(overrides: {
  id?: string;
  state?: string;
  progress?: number;
  returnvalue?: unknown;
  failedReason?: string;
  data?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    id: overrides.id ?? 'job-async-001',
    data: overrides.data ?? { type: 'portfolio', payload: {} },
    progress: overrides.progress ?? 0,
    returnvalue: overrides.returnvalue,
    failedReason: overrides.failedReason,
    getState: vi.fn().mockResolvedValue(overrides.state ?? 'completed'),
  };
}

// ===== 测试用例 =====

describe('P0-03 backtestRoutes - 异步回测', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeEach(async () => {
    server = await setupPortfolioServer(backtestRoutes, m);
    queueMocks.add.mockReset();
    queueMocks.getJob.mockReset();
  });

  afterEach(async () => {
    await server.close();
  });

  // ---------------------------------------------------------------------------
  // POST /portfolio — 异步默认路径（202）
  // ---------------------------------------------------------------------------

  describe('POST /api/backtest/portfolio — 异步路径', () => {
    it('队列可用时返回 202 + jobId + statusUrl', async () => {
      queueMocks.add.mockResolvedValue({ id: 'job-202-001' });

      const res = await fetch(`${server.url}/api/backtest/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidRequestBody()),
      });

      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.jobId).toBe('job-202-001');
      expect(json.data.status).toBe('queued');
      expect(json.data.statusUrl).toContain('/runs/job-202-001');
      expect(queueMocks.add).toHaveBeenCalledTimes(1);
      // 队列可用时不应调用同步执行
      expect(m.runPortfolioBacktest).not.toHaveBeenCalled();
    });

    it('队列 add 抛错时应 fail-closed 返回 503（ADR-031，不再降级同步）', async () => {
      queueMocks.add.mockRejectedValue(new Error('Redis connection refused'));

      const res = await fetch(`${server.url}/api/backtest/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createValidRequestBody()),
      });

      expect(res.status).toBe(503);
      expect(res.headers.get('retry-after')).toBe('30');
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('SERVICE_TEMPORARILY_UNAVAILABLE');
      // fail-closed：不应调用同步执行
      expect(m.runPortfolioBacktest).not.toHaveBeenCalled();
      expect(loggerMocks.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // POST /portfolio — 同步快速路径已废弃（P0-02 统一异步模式）
  // X-Backtest-Sync 头不再触发同步路径，统一走异步 202。
  // ---------------------------------------------------------------------------

  describe('POST /api/backtest/portfolio — X-Backtest-Sync 头已废弃', () => {
    it('X-Backtest-Sync: true 时仍走异步路径返回 202（同步路径已移除）', async () => {
      // 即使携带同步头，路由也统一走异步入队
      queueMocks.add.mockResolvedValue({ id: 'job-async-002' });

      const res = await fetch(`${server.url}/api/backtest/portfolio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Backtest-Sync': 'true',
        },
        body: JSON.stringify(createValidRequestBody()),
      });

      expect(res.status).toBe(202);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.jobId).toBe('job-async-002');
      // 同步路径不应执行
      expect(m.runPortfolioBacktest).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // GET /runs/:jobId — 任务状态查询
  // ---------------------------------------------------------------------------

  describe('GET /api/backtest/runs/:jobId — 状态查询', () => {
    it('completed 状态返回 200 + 结果', async () => {
      const mockResult = {
        data: { portfolios: [{ name: 'Test', growthCurve: [] }] },
        warnings: [],
        dateRange: { start: '2024-01-01', end: '2024-06-30' },
      };
      const job = createMockJob({
        id: 'job-done',
        state: 'completed',
        progress: 100,
        returnvalue: { status: 'completed', result: mockResult },
      });
      queueMocks.getJob.mockResolvedValue(job);

      const res = await fetch(`${server.url}/api/backtest/runs/job-done`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.jobId).toBe('job-done');
      expect(json.data.status).toBe('completed');
      expect(json.data.progress).toBe(100);
      expect(json.data.result).toEqual(mockResult);
    });

    it('failed 状态返回 200 + 错误信息', async () => {
      const job = createMockJob({
        id: 'job-failed',
        state: 'failed',
        progress: 30,
        failedReason: 'Engine timeout after 90s',
      });
      queueMocks.getJob.mockResolvedValue(job);

      const res = await fetch(`${server.url}/api/backtest/runs/job-failed`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.jobId).toBe('job-failed');
      expect(json.data.status).toBe('failed');
      expect(json.data.error).toBe('Engine timeout after 90s');
    });

    it('running 状态返回 200 + 进度', async () => {
      const job = createMockJob({
        id: 'job-running',
        state: 'active',
        progress: 45,
      });
      queueMocks.getJob.mockResolvedValue(job);

      const res = await fetch(`${server.url}/api/backtest/runs/job-running`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.jobId).toBe('job-running');
      expect(json.data.status).toBe('running');
      expect(json.data.progress).toBe(45);
      // running 状态不应包含 result 或 error
      expect(json.data.result).toBeUndefined();
      expect(json.data.error).toBeUndefined();
    });

    it('delayed 状态映射为 queued', async () => {
      const job = createMockJob({
        id: 'job-delayed',
        state: 'delayed',
        progress: 0,
      });
      queueMocks.getJob.mockResolvedValue(job);

      const res = await fetch(`${server.url}/api/backtest/runs/job-delayed`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('queued');
    });

    it('任务不存在时返回 404', async () => {
      queueMocks.getJob.mockResolvedValue(null);

      const res = await fetch(`${server.url}/api/backtest/runs/nonexistent`);

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('JOB_NOT_FOUND');
    });

    it('returnvalue 为 failed 时返回 error', async () => {
      const job = createMockJob({
        id: 'job-rv-failed',
        state: 'completed',
        progress: 100,
        returnvalue: { status: 'failed', error: 'Parameter validation failed' },
      });
      queueMocks.getJob.mockResolvedValue(job);

      const res = await fetch(`${server.url}/api/backtest/runs/job-rv-failed`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe('completed');
      expect(json.data.error).toBe('Parameter validation failed');
    });
  });
});
