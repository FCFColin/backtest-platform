/**
 * 信号分析路由单元测试
 *
 * 企业理由：信号分析（单/双/多）是交易策略核心，参数校验和数据完整性
 * 影响信号正确性。测试覆盖：成功分析、参数校验失败、价格数据缺失、引擎异常。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger } from '../../helpers/mockFactories.js';

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

const seriesUtilsMocks = vi.hoisted(() => ({
  toPriceSeries: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  analyzeSignal: vi.fn(),
  analyzeDualSignal: vi.fn(),
  analyzeMultiSignal: vi.fn(),
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

vi.mock('../../../packages/backend/src/engine/seriesUtils.js', () => ({
  toPriceSeries: seriesUtilsMocks.toPriceSeries,
}));

vi.mock('../../../packages/backend/src/engine/signal.js', () => ({
  analyzeSignal: engineMocks.analyzeSignal,
  analyzeDualSignal: engineMocks.analyzeDualSignal,
  analyzeMultiSignal: engineMocks.analyzeMultiSignal,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import signalRoutes from '../../../packages/backend/src/routes/signalRoutes.js';

function createSignalConfig(ticker = 'SPY') {
  return {
    ticker,
    indicator: 'sma',
    period: 20,
    threshold: 0,
    startDate: '2020-01-01',
    endDate: '2024-01-01',
    signalType: 'both' as const,
  };
}

const mockPriceData = [
  { date: '2020-01-01', price: 300.0 },
  { date: '2020-01-02', price: 301.0 },
];

describe('signalRoutes - POST /api/signal/analyze', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 },
    });
    seriesUtilsMocks.toPriceSeries.mockReturnValue(mockPriceData);
    engineMocks.analyzeSignal.mockReturnValue({
      signals: [{ date: '2020-01-02', type: 'buy', price: 301.0 }],
      statistics: { totalSignals: 1, winRate: 1.0, avgReturn: 0.01, maxDrawdown: 0, sharpe: 2.0 },
      equityCurve: [{ date: '2020-01-01', value: 10000 }],
    });
    server = await startExpressApp((app) => app.use('/api/signal', signalRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回单信号分析结果', async () => {
    const res = await fetch(`${server.url}/api/signal/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createSignalConfig()),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.signals).toHaveLength(1);
    expect(body.data.statistics.winRate).toBe(1.0);
    expect(engineMocks.analyzeSignal).toHaveBeenCalledTimes(1);
  });

  it('缺少 ticker 应返回 400（zod 校验失败）', async () => {
    const req = createSignalConfig();
    delete (req as Record<string, unknown>).ticker;

    const res = await fetch(`${server.url}/api/signal/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.analyzeSignal).not.toHaveBeenCalled();
  });

  it('无效 signalType 应返回 400（zod 校验失败）', async () => {
    const req = createSignalConfig();
    (req as Record<string, unknown>).signalType = 'invalid';

    const res = await fetch(`${server.url}/api/signal/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('价格数据为空时应返回 404', async () => {
    seriesUtilsMocks.toPriceSeries.mockReturnValue([]);

    const res = await fetch(`${server.url}/api/signal/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createSignalConfig()),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.detail).toContain('SPY');
  });

  it('analyzeSignal 抛错时应返回 500', async () => {
    engineMocks.analyzeSignal.mockImplementation(() => {
      throw new Error('signal engine error');
    });

    const res = await fetch(`${server.url}/api/signal/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createSignalConfig()),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.detail).toBe('信号分析失败');
  });

  it('analyzeSignal 抛非 Error 值时应返回 500', async () => {
    engineMocks.analyzeSignal.mockImplementation(() => {
      throw 'string error';
    });

    const res = await fetch(`${server.url}/api/signal/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createSignalConfig()),
    });

    expect(res.status).toBe(500);
  });
});

describe('signalRoutes - POST /api/signal/dual', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      SPY: { '2020-01-01': 300.0 },
      QQQ: { '2020-01-01': 200.0 },
    });
    seriesUtilsMocks.toPriceSeries.mockReturnValue(mockPriceData);
    engineMocks.analyzeDualSignal.mockReturnValue({
      signals: [{ date: '2020-01-02', type: 'buy', price: 301.0 }],
      statistics: { totalSignals: 1, winRate: 1.0, avgReturn: 0.01, maxDrawdown: 0, sharpe: 2.0 },
      equityCurve: [],
    });
    server = await startExpressApp((app) => app.use('/api/signal', signalRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回双信号分析结果', async () => {
    const req = {
      signal1: createSignalConfig('SPY'),
      signal2: createSignalConfig('QQQ'),
      combinationMethod: 'and' as const,
    };

    const res = await fetch(`${server.url}/api/signal/dual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.signals).toHaveLength(1);
    expect(engineMocks.analyzeDualSignal).toHaveBeenCalledTimes(1);
  });

  it('缺少 combinationMethod 应返回 400（zod 校验失败）', async () => {
    const req = {
      signal1: createSignalConfig('SPY'),
      signal2: createSignalConfig('QQQ'),
    };

    const res = await fetch(`${server.url}/api/signal/dual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.analyzeDualSignal).not.toHaveBeenCalled();
  });

  it('价格数据为空时应返回 404', async () => {
    seriesUtilsMocks.toPriceSeries.mockReturnValue([]);

    const req = {
      signal1: createSignalConfig('SPY'),
      signal2: createSignalConfig('QQQ'),
      combinationMethod: 'and' as const,
    };

    const res = await fetch(`${server.url}/api/signal/dual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(404);
  });

  it('analyzeDualSignal 抛错时应返回 500', async () => {
    engineMocks.analyzeDualSignal.mockImplementation(() => {
      throw new Error('dual signal error');
    });

    const req = {
      signal1: createSignalConfig('SPY'),
      signal2: createSignalConfig('QQQ'),
      combinationMethod: 'and' as const,
    };

    const res = await fetch(`${server.url}/api/signal/dual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(500);
  });

  it('analyzeDualSignal 抛非 Error 值时应返回 500', async () => {
    engineMocks.analyzeDualSignal.mockImplementation(() => {
      throw 42;
    });

    const req = {
      signal1: createSignalConfig('SPY'),
      signal2: createSignalConfig('QQQ'),
      combinationMethod: 'and' as const,
    };

    const res = await fetch(`${server.url}/api/signal/dual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(500);
  });
});

describe('signalRoutes - POST /api/signal/multi', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 },
    });
    seriesUtilsMocks.toPriceSeries.mockReturnValue(mockPriceData);
    engineMocks.analyzeMultiSignal.mockReturnValue({
      signals: [{ date: '2020-01-02', type: 'buy', price: 301.0 }],
      statistics: { totalSignals: 1, winRate: 1.0, avgReturn: 0.01, maxDrawdown: 0, sharpe: 2.0 },
      equityCurve: [],
    });
    server = await startExpressApp((app) => app.use('/api/signal', signalRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回多信号分析结果', async () => {
    const req = {
      signals: [
        createSignalConfig('SPY'),
        { ...createSignalConfig('SPY'), indicator: 'rsi', period: 14, threshold: 30 },
      ],
      aggregationMethod: 'voting' as const,
    };

    const res = await fetch(`${server.url}/api/signal/multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.signals).toHaveLength(1);
    expect(engineMocks.analyzeMultiSignal).toHaveBeenCalledTimes(1);
  });

  it('空 signals 数组应返回 400（zod 校验失败）', async () => {
    const req = {
      signals: [],
      aggregationMethod: 'voting' as const,
    };

    const res = await fetch(`${server.url}/api/signal/multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.analyzeMultiSignal).not.toHaveBeenCalled();
  });

  it('缺少 aggregationMethod 应返回 400（zod 校验失败）', async () => {
    const req = {
      signals: [createSignalConfig('SPY')],
    };

    const res = await fetch(`${server.url}/api/signal/multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('价格数据为空时应返回 404', async () => {
    seriesUtilsMocks.toPriceSeries.mockReturnValue([]);

    const req = {
      signals: [createSignalConfig('SPY')],
      aggregationMethod: 'voting' as const,
    };

    const res = await fetch(`${server.url}/api/signal/multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(404);
  });

  it('analyzeMultiSignal 抛错时应返回 500', async () => {
    engineMocks.analyzeMultiSignal.mockImplementation(() => {
      throw new Error('multi signal error');
    });

    const req = {
      signals: [createSignalConfig('SPY')],
      aggregationMethod: 'voting' as const,
    };

    const res = await fetch(`${server.url}/api/signal/multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(500);
  });

  it('analyzeMultiSignal 抛非 Error 值时应返回 500', async () => {
    engineMocks.analyzeMultiSignal.mockImplementation(() => {
      throw null;
    });

    const req = {
      signals: [createSignalConfig('SPY')],
      aggregationMethod: 'voting' as const,
    };

    const res = await fetch(`${server.url}/api/signal/multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(500);
  });
});
