/**
 * 契约响应体抽样测试 — 对 5 个代表端点发起真实 HTTP 请求，响应体逐一过 zod safeParse。
 * 目的：锁定响应信封形状（success/data/错误 RFC7807/分页），防路由层形状漂移。
 * mock 手段参照 tests/unit/routes 现成范式（middleware 注入 + vi.mock 基础设施）。
 *
 * 端点清单（生产挂载见 app.ts）：
 *  1. POST /api/v1/backtest/portfolio   → 202 异步提交形状（statusUrl 指向 /api/v1/backtest/runs/:jobId）
 *  2. GET  /api/health                  → 探活信封（生产挂载 /api，即任务书所指 health 端点）
 *  3. GET  /api/v1/data/cpi/:country    → 公开数据端点（200 + degraded 变体）
 *  4. GET  /api/v1/data/cpi/xx          → 4xx RFC7807 ProblemDetails
 *  5. GET  /api/v1/data/manage/tickers  → 分页端点（page/limit/total/totalPages 信封）
 */
import '../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { startExpressApp, reqJson, injectAuth, type TestServer } from '../helpers/expressApp.js';
import { redisModuleMock } from '../helpers/redisFixture.js';
import {
  createPoolModuleMock,
  mockConfigModule,
  mockBacktestQueue,
} from '../helpers/mockFactories.js';

const ORG = '11111111-1111-1111-1111-111111111111';

// ── 基础设施 mock（范式同 tests/unit/routes/*）────────────────────────────
const queueMocks = vi.hoisted(() => ({ add: vi.fn(), getJob: vi.fn() }));
const runRepoMocks = vi.hoisted(() => ({
  save: vi.fn(),
  listRuns: vi.fn(),
  getRun: vi.fn(),
  createRun: vi.fn(),
  deleteRun: vi.fn(),
}));
const dataSvcMocks = vi.hoisted(() => ({
  fetchCpiForRoute: vi.fn(),
  startUpdate: vi.fn(),
  stopUpdate: vi.fn(),
  getUpdateStatus: vi.fn(),
}));
const engineSvcMocks = vi.hoisted(() => ({
  getEngineStatus: vi.fn(),
  getTickerList: vi.fn(),
  loadTickerData: vi.fn(),
  resolveUniverseFromCacheStats: vi.fn(),
}));
const appSvcMocks = vi.hoisted(() => ({
  runAnalysis: vi.fn(),
  runMonteCarlo: vi.fn(),
  runOptimization: vi.fn(),
  runEfficientFrontier: vi.fn(),
}));

vi.mock('../../packages/backend/src/config/index.js', () => mockConfigModule({ NODE_ENV: 'test' }));
vi.mock('../../packages/backend/src/db/pool.js', () =>
  createPoolModuleMock(undefined, { exports: { pool: { query: vi.fn() } } }),
);
vi.mock('../../packages/backend/src/infrastructure/redisClient.js', () => redisModuleMock);
vi.mock('../../packages/backend/src/queues/backtestQueue.js', () =>
  mockBacktestQueue(queueMocks.add, queueMocks.getJob),
);
vi.mock('../../packages/backend/src/repositories/backtestRunRepo.js', () => ({
  save: runRepoMocks.save,
  listRuns: runRepoMocks.listRuns,
  getRun: runRepoMocks.getRun,
  createRun: runRepoMocks.createRun,
  deleteRun: runRepoMocks.deleteRun,
  markStalePendingRunsFailed: vi.fn(),
}));
vi.mock('../../packages/backend/src/infrastructure/dataServices.js', () => ({
  SYNTHETIC_TICKERS: [],
  fetchCpiForRoute: dataSvcMocks.fetchCpiForRoute,
  startUpdate: dataSvcMocks.startUpdate,
  stopUpdate: dataSvcMocks.stopUpdate,
  getUpdateStatus: dataSvcMocks.getUpdateStatus,
}));
vi.mock('../../packages/backend/src/infrastructure/dataQuery.js', () => ({
  getEngineStatus: engineSvcMocks.getEngineStatus,
  getTickerList: engineSvcMocks.getTickerList,
  loadTickerData: engineSvcMocks.loadTickerData,
  resolveUniverseFromCacheStats: engineSvcMocks.resolveUniverseFromCacheStats,
}));
vi.mock('../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  searchTickers: vi.fn(),
  fetchHistoryData: vi.fn(),
  validateTickers: vi.fn(),
  initDb: vi.fn(),
}));
vi.mock('../../packages/backend/src/application/analysis-orchestrator.js', () => ({
  runAnalysis: appSvcMocks.runAnalysis,
}));
vi.mock('../../packages/backend/src/application/montecarlo-service.js', () => ({
  runMonteCarlo: appSvcMocks.runMonteCarlo,
}));
vi.mock('../../packages/backend/src/application/optimize-service.js', () => ({
  runOptimization: appSvcMocks.runOptimization,
  runEfficientFrontier: appSvcMocks.runEfficientFrontier,
}));
vi.mock('../../packages/backend/src/db/marketStats.js', () => ({
  scanMarketStatsFromDb: vi.fn(),
  getLastUpdated: vi.fn(),
}));

import healthRoutes from '../../packages/backend/src/routes/healthRoutes.js';
import dataRoutes from '../../packages/backend/src/routes/dataRoutes.js';
import dataManageRoutes from '../../packages/backend/src/routes/dataManageRoutes.js';
import backtestRoutes from '../../packages/backend/src/routes/backtestRoutes.js';

// ── 响应体契约 schema（锁定信封形状）────────────────────────────────────
const submitted202Schema = z.object({
  success: z.literal(true),
  data: z.object({
    jobId: z.string().min(1),
    status: z.literal('queued'),
    statusUrl: z.string().startsWith('/api/v1/backtest/runs/'),
  }),
});

const healthOkSchema = z.object({
  success: z.literal(true),
  data: z.object({
    status: z.literal('ok'),
    timestamp: z.string(),
    redis: z.object({ mode: z.enum(['sentinel', 'standalone']) }),
  }),
});

const cpiEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.record(z.string(), z.number()),
});

const cpiDegradedSchema = z.object({
  success: z.literal(true),
  degraded: z.literal(true),
  degradedWarning: z.string().min(1),
  data: z.unknown(),
});

const problemDetailsSchema = z.object({
  success: z.literal(false),
  error: z.object({
    type: z.string(),
    title: z.string(),
    status: z.number(),
    code: z.string(),
    detail: z.string().optional(),
    instance: z.string().optional(),
  }),
});

const paginatedTickersSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      ticker: z.string(),
      name: z.string(),
      category: z.string(),
      market: z.string(),
    }),
  ),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const validPortfolioBody = () => ({
  portfolios: [
    {
      name: '60/40',
      assets: [
        { ticker: 'SPY', weight: 60 },
        { ticker: 'BND', weight: 40 },
      ],
      rebalanceFrequency: 'monthly',
    },
  ],
  parameters: { startDate: '2024-01-01', endDate: '2024-06-30' },
});

describe('契约响应体抽样 — 5 代表端点 zod safeParse', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => {
      app.use(injectAuth({ sub: 'user-1', role: 'admin', tenantId: ORG }));
      app.use('/api', healthRoutes);
      app.use('/api/v1/data', dataRoutes);
      app.use('/api/v1/data/manage', dataManageRoutes);
      app.use('/api/v1/backtest', backtestRoutes);
    });
  });
  afterEach(async () => {
    await server.close();
  });

  it('POST /api/v1/backtest/portfolio → 202 异步提交形状（statusUrl → /api/v1/backtest/runs/:jobId）', async () => {
    queueMocks.add.mockResolvedValue({ id: 'job-contract-001' });
    runRepoMocks.save.mockResolvedValue({
      id: 'job-contract-001',
      name: 'portfolio',
      request: {},
      result: null,
      status: 'pending',
      ownerUserId: 'user-1',
      createdAt: new Date().toISOString(),
    });
    const { res, body } = await reqJson(
      `${server.url}/api/v1/backtest/portfolio`,
      'POST',
      validPortfolioBody(),
    );
    expect(res.status).toBe(202);
    const parsed = submitted202Schema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.data.jobId).toBe('job-contract-001');
      expect(runRepoMocks.save).toHaveBeenCalledWith(
        ORG,
        expect.objectContaining({ id: 'job-contract-001', status: 'pending' }),
      );
    }
  });

  it('GET /api/health → 探活信封（生产挂载 /api，状态 + 时间戳 + redis 模式）', async () => {
    const { res, body } = await reqJson(`${server.url}/api/health`, 'GET');
    expect(res.status).toBe(200);
    const parsed = healthOkSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  it('GET /api/v1/data/cpi/us → 公开数据端点 200 信封；degraded 变体带 degradedWarning', async () => {
    dataSvcMocks.fetchCpiForRoute.mockResolvedValue({
      data: { '2024-01': 310.5, '2024-02': 311.2 },
      degraded: false,
      notFound: false,
    });
    const ok = await reqJson(`${server.url}/api/v1/data/cpi/us`, 'GET');
    expect(ok.res.status).toBe(200);
    expect(cpiEnvelopeSchema.safeParse(ok.body).success).toBe(true);

    dataSvcMocks.fetchCpiForRoute.mockResolvedValue({
      data: [{ date: '2024-01-01', value: 310.5 }],
      degraded: true,
      degradedWarning: 'Go 数据服务不可用，已降级到 PostgreSQL CPI 数据',
      notFound: false,
    });
    const degraded = await reqJson(`${server.url}/api/v1/data/cpi/us`, 'GET');
    expect(degraded.res.status).toBe(200);
    expect(cpiDegradedSchema.safeParse(degraded.body).success).toBe(true);
  });

  it('GET /api/v1/data/cpi/xx → 422 RFC7807 ProblemDetails（application/problem+json）', async () => {
    const { res, body } = await reqJson(`${server.url}/api/v1/data/cpi/xx`, 'GET');
    expect(res.status).toBe(422);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const parsed = problemDetailsSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.error.code).toBe('INVALID_COUNTRY');
      expect(parsed.data.error.status).toBe(422);
    }
  });

  it('GET /api/v1/data/manage/tickers?page=1&limit=5 → 分页信封（page/limit/total/totalPages）', async () => {
    engineSvcMocks.getTickerList.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({
        ticker: `TICK${i}`,
        name: `Ticker ${i}`,
        category: 'stock',
        market: 'US',
      })),
    );
    const { res, body } = await reqJson(
      `${server.url}/api/v1/data/manage/tickers?page=1&limit=5`,
      'GET',
    );
    expect(res.status).toBe(200);
    const parsed = paginatedTickersSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.data).toHaveLength(5);
      expect(parsed.data.pagination).toEqual({ page: 1, limit: 5, total: 7, totalPages: 2 });
    }
  });
});
