/**
 * 目标优化路由单元测试
 *
 * 企业理由：目标优化计算达成财务目标的概率，参数校验和数据完整性
 * 直接影响结果可信度。测试覆盖：成功优化、参数校验失败、价格数据缺失、引擎异常。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger } from '../../helpers/mockFactories.js';

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  optimizeGoals: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
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
}));

vi.mock('../../../packages/backend/src/services/dataService.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));

vi.mock('../../../packages/backend/src/engine/goalOptimizer.js', () => ({
  optimizeGoals: engineMocks.optimizeGoals,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import goalOptimizerRoutes from '../../../packages/backend/src/routes/goalOptimizerRoutes.js';

function createValidRequest() {
  return {
    targetAmount: 1000000,
    initialAmount: 100000,
    years: 20,
    assets: [{ ticker: 'SPY', weight: 100 }],
    numSimulations: 1000,
  };
}

describe('goalOptimizerRoutes - POST /api/goal-optimizer/optimize', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 },
    });
    engineMocks.optimizeGoals.mockReturnValue({
      successProbability: 0.85,
      probabilityCurve: [{ year: 1, probability: 0.95 }],
      optimalPath: [],
      requiredContribution: 20000,
    });
    server = await startExpressApp((app) => app.use('/api/goal-optimizer', goalOptimizerRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回优化结果', async () => {
    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.successProbability).toBe(0.85);
    expect(body.data.probabilityCurve).toHaveLength(1);
    expect(engineMocks.optimizeGoals).toHaveBeenCalledTimes(1);
  });

  it('缺少 targetAmount 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    delete (req as Record<string, unknown>).targetAmount;

    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.optimizeGoals).not.toHaveBeenCalled();
  });

  it('targetAmount 为负数应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.targetAmount = -100;

    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.optimizeGoals).not.toHaveBeenCalled();
  });

  it('空 assets 数组应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.assets = [];

    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.optimizeGoals).not.toHaveBeenCalled();
  });

  it('价格数据缺失时应返回 400', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({});

    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.detail).toContain('未找到价格数据');
    expect(engineMocks.optimizeGoals).not.toHaveBeenCalled();
  });

  it('部分标的价格数据缺失时应返回 400', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      SPY: {},
    });

    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.detail).toContain('SPY');
  });

  it('引擎返回 successProbability=0 且空曲线时应返回 400', async () => {
    engineMocks.optimizeGoals.mockReturnValue({
      successProbability: 0,
      probabilityCurve: [],
    });

    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.detail).toContain('历史价格数据不足');
  });

  it('optimizeGoals 抛错时应返回 500', async () => {
    engineMocks.optimizeGoals.mockImplementation(() => {
      throw new Error('engine boom');
    });

    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.detail).toBe('engine boom');
  });

  it('空白 ticker 应触发有效标的校验失败', async () => {
    const req = createValidRequest();
    req.assets = [{ ticker: '   ', weight: 100 }];

    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.detail).toContain('至少添加一个有效标的');
  });

  it('引擎抛非 Error 值时应返回 500', async () => {
    engineMocks.optimizeGoals.mockImplementation(() => {
      throw 'string error';
    });

    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.detail).toBe('string error');
  });

  it('引擎抛空消息 Error 时应返回默认错误信息', async () => {
    engineMocks.optimizeGoals.mockImplementation(() => {
      throw new Error('');
    });

    const res = await fetch(`${server.url}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.detail).toBe('目标优化失败');
  });
});
