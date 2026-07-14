/**
 * 优化器全链路集成测试（RO-049 SubTask 33.1）
 *
 * 跨层验证：Express 路由 → Zod 校验 → BullMQ 异步提交 / 同步回退 → 引擎 → 响应。
 * 重点覆盖 ADR-034 异步任务携带租户/owner 归属，与 ADR-031 fail-closed。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

const EngineUnavailableError = class EngineUnavailableError extends Error {
  retryAfterSeconds: number;
  constructor(endpoint: string, retryAfterSeconds = 30) {
    super(`Go 引擎不可用: ${endpoint}`);
    this.name = 'EngineUnavailableError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
};

vi.mock('../../packages/backend/src/utils/engineClient.js', () => ({
  EngineUnavailableError,
  callEngineStrict: vi.fn(),
  resetEngineAvailability: vi.fn(),
  callGoEngineDirect: vi.fn(),
}));

const queueAddMock = vi.fn();
vi.mock('../../packages/backend/src/queues/backtestQueue.js', () => ({
  backtestQueue: { add: queueAddMock },
}));

const executeOptimizationMock = vi.fn();
vi.mock('../../packages/backend/src/application/optimizer-application-service.js', () => ({
  executeOptimization: executeOptimizationMock,
}));

import express from 'express';
import backtestOptimizerRoutes from '../../packages/backend/src/routes/backtestOptimizerRoutes.js';
import { mockAuthMiddleware } from '../helpers/testcontainersPg.js';

const orgId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'optimizer-user';
let baseUrl = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(mockAuthMiddleware(orgId, userId));
  app.use('/api/v1/backtest-optimizer', backtestOptimizerRoutes);

  await new Promise<void>((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  vi.restoreAllMocks();
});

const validBody = {
  portfolio: {
    name: '测试组合',
    assets: [{ ticker: 'AAPL', weight: 60 }],
  },
  parameterSpace: {
    rebalanceFrequencies: ['quarterly'],
    initialCapital: { min: 10000, max: 50000, step: 10000 },
  },
  parameters: { startDate: '2020-01-01', endDate: '2023-12-31' },
  objective: 'maxSharpe',
};

describe('优化器全链路集成测试', () => {
  it('POST /optimize 队列可用时返回 202 + jobId（携带租户归属 ADR-034）', async () => {
    queueAddMock.mockResolvedValueOnce({ id: 'job-async-1' });

    const res = await fetch(`${baseUrl}/api/v1/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.jobId).toBe('job-async-1');
    expect(json.data.statusUrl).toBe('/api/v1/jobs/job-async-1');

    expect(queueAddMock).toHaveBeenCalledWith(
      'optimizer',
      expect.objectContaining({
        type: 'optimizer',
        tenantId: orgId,
        ownerUserId: userId,
      }),
    );
  });

  it('POST /optimize 队列不可用时回退同步执行并返回 200', async () => {
    queueAddMock.mockRejectedValueOnce(new Error('Redis 不可用'));
    executeOptimizationMock.mockResolvedValueOnce({
      success: true,
      data: { optimalWeights: { AAPL: 1 }, sharpe: 1.2 },
    });

    const res = await fetch(`${baseUrl}/api/v1/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.optimalWeights).toEqual({ AAPL: 1 });
  });

  it('POST /optimize 同步执行引擎不可用时 fail-closed 503 + degraded', async () => {
    queueAddMock.mockRejectedValueOnce(new Error('Redis 不可用'));
    executeOptimizationMock.mockRejectedValueOnce(
      new EngineUnavailableError('/api/engine/optimize', 60),
    );

    const res = await fetch(`${baseUrl}/api/v1/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('retry-after')).toBe('60');
    const json = await res.json();
    expect(json.error.code).toBe('ENGINE_UNAVAILABLE');
    expect(json.degraded).toBe(true);
  });

  it('POST /optimize 非法 objective 返回校验错误', async () => {
    const res = await fetch(`${baseUrl}/api/v1/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, objective: 'invalid' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /optimize 空资产数组返回校验错误', async () => {
    const res = await fetch(`${baseUrl}/api/v1/backtest-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        portfolio: { assets: [] },
      }),
    });
    expect(res.status).toBe(400);
  });
});
