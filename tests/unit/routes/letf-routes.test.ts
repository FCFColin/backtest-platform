/**
 * LETF 滑点分析路由单元测试
 *
 * 企业理由：杠杆 ETF 滑点分析需要准确的价格数据，参数校验和数据完整性
 * 影响分析结果可信度。测试覆盖：成功分析、参数校验失败、价格数据缺失、引擎异常。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/engineRouteMocks.js';

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  callEngineStrict: vi.fn(),
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

vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import letfRoutes from '../../../packages/backend/src/routes/letfRoutes.js';

function createValidRequest() {
  return {
    letfTicker: 'TQQQ',
    benchmarkTicker: 'QQQ',
    leverage: 3,
    startDate: '2020-01-01',
    endDate: '2024-01-01',
  };
}

const mockLetfResult = {
  slippageCurve: [{ date: '2020-01-01', slippage: 0.01 }],
  annualDecay: 0.05,
};

describe('letfRoutes - POST /api/letf/analyze', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: {
        TQQQ: { '2020-01-01': 30.0, '2020-01-02': 31.0 },
        QQQ: { '2020-01-01': 200.0, '2020-01-02': 201.0 },
      },
      degraded: false,
    });
    engineMocks.callEngineStrict.mockResolvedValue(mockLetfResult);
    server = await startExpressApp((app) => app.use('/api/letf', letfRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回滑点分析结果', async () => {
    const res = await fetch(`${server.url}/api/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.slippageCurve).toHaveLength(1);
    expect(body.data.annualDecay).toBe(0.05);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
  });

  it('应将 ticker 转为大写并调用 fetchHistoryData', async () => {
    const req = createValidRequest();
    req.letfTicker = 'tqqq';
    req.benchmarkTicker = 'qqq';

    await fetch(`${server.url}/api/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    const callArgs = dataServiceMocks.fetchHistoryData.mock.calls[0];
    expect(callArgs[0]).toEqual(['TQQQ', 'QQQ']);
    expect(callArgs[1]).toBe('2020-01-01');
    expect(callArgs[2]).toBe('2024-01-01');
  });

  it('缺少 letfTicker 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    delete (req as Record<string, unknown>).letfTicker;

    const res = await fetch(`${server.url}/api/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('leverage 为负数应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.leverage = -1;

    const res = await fetch(`${server.url}/api/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });

  it('缺少 startDate 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    delete (req as Record<string, unknown>).startDate;

    const res = await fetch(`${server.url}/api/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('LETF 价格数据缺失时应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: {
        TQQQ: {},
        QQQ: { '2020-01-01': 200.0 },
      },
      degraded: false,
    });

    const res = await fetch(`${server.url}/api/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.detail).toContain('TQQQ');
  });

  it('基准价格数据缺失时应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      data: {
        TQQQ: { '2020-01-01': 30.0 },
        QQQ: {},
      },
      degraded: false,
    });

    const res = await fetch(`${server.url}/api/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.detail).toContain('QQQ');
  });

  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('letf engine error'));

    const res = await fetch(`${server.url}/api/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });

    expect(res.status).toBe(500);
  });
});
