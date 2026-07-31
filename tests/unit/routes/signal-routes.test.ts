import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger } from '../../helpers/mockFactories.js';
import { EngineUnavailableErrorStub } from '../../helpers/backtestRoutesFixtures.js';

const dataServiceMocks = vi.hoisted(() => ({ fetchHistoryData: vi.fn() }));
const engineMocks = vi.hoisted(() => ({ callEngineStrict: vi.fn() }));
const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

vi.mock('../../../packages/backend/src/infrastructure/dataFacade.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));
vi.mock('../../../packages/backend/src/utils/engineClient.js', () => ({
  callEngineStrict: engineMocks.callEngineStrict,
  EngineUnavailableError: EngineUnavailableErrorStub,
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

const mockEngineResult = {
  signals: [{ date: '2020-01-02', type: 'buy', price: 301.0 }],
  statistics: { totalSignals: 1, winRate: 1.0, avgReturn: 0.01, maxDrawdown: 0, sharpe: 2.0 },
  equityCurve: [{ date: '2020-01-01', value: 10000 }],
};

async function apiPost(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json().catch(() => null) };
}

describe.each([
  {
    path: '/api/signal/analyze',
    data: { SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 } },
    engineResult: mockEngineResult,
    validReq: () => createSignalConfig(),
    validation: [
      [
        '缺少 ticker',
        () => {
          const r = createSignalConfig();
          delete (r as Record<string, unknown>).ticker;
          return r;
        },
      ],
      ['无效 signalType', () => ({ ...createSignalConfig(), signalType: 'invalid' })],
    ],
  },
  {
    path: '/api/signal/dual',
    data: { SPY: { '2020-01-01': 300.0 }, QQQ: { '2020-01-01': 200.0 } },
    engineResult: { ...mockEngineResult, equityCurve: [] },
    validReq: () => ({
      signal1: createSignalConfig('SPY'),
      signal2: createSignalConfig('QQQ'),
      combinationMethod: 'and',
    }),
    validation: [
      [
        '缺少 combinationMethod',
        () => ({ signal1: createSignalConfig('SPY'), signal2: createSignalConfig('QQQ') }),
      ],
    ],
  },
  {
    path: '/api/signal/multi',
    data: { SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 } },
    engineResult: { ...mockEngineResult, equityCurve: [] },
    validReq: () => ({
      signals: [
        createSignalConfig('SPY'),
        { ...createSignalConfig('SPY'), indicator: 'rsi', period: 14, threshold: 30 },
      ],
      aggregationMethod: 'voting',
    }),
    validation: [
      ['空 signals 数组', () => ({ signals: [], aggregationMethod: 'voting' })],
      ['缺少 aggregationMethod', () => ({ signals: [createSignalConfig('SPY')] })],
    ],
  },
])('signalRoutes - POST $path', (c) => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({ data: c.data, degraded: false });
    engineMocks.callEngineStrict.mockResolvedValue(c.engineResult);
    server = await startExpressApp((app) => app.use('/api/signal', signalRoutes));
  });
  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回分析结果', async () => {
    const { res, body } = await apiPost(`${server.url}${c.path}`, c.validReq());
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.signals).toHaveLength(1);
    expect(engineMocks.callEngineStrict).toHaveBeenCalledTimes(1);
  });
  it.each(c.validation)('%s 应返回 400（zod 校验失败）', async (_n, getReq) => {
    const { res } = await apiPost(`${server.url}${c.path}`, getReq());
    expect(res.status).toBe(400);
    expect(engineMocks.callEngineStrict).not.toHaveBeenCalled();
  });
  it('价格数据缺失时应返回 404', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({ data: { SPY: {} }, degraded: false });
    const { res, body } = await apiPost(`${server.url}${c.path}`, c.validReq());
    expect(res.status).toBe(404);
    expect(body.error.code).toBe('DATA_NOT_FOUND');
  });
  it('引擎抛错时应返回 500', async () => {
    engineMocks.callEngineStrict.mockRejectedValueOnce(new Error('signal engine error'));
    const { res } = await apiPost(`${server.url}${c.path}`, c.validReq());
    expect(res.status).toBe(500);
  });
});
