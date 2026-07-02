/**
 * PCA 主成分分析路由单元测试
 *
 * 企业理由：PCA 分析需要多资产价格数据，参数校验和数据完整性
 * 影响分析结果。测试覆盖：成功分析、参数校验失败、价格数据缺失、引擎异常。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger } from '../../helpers/mockFactories.js';

const dataServiceMocks = vi.hoisted(() => ({
  fetchHistoryData: vi.fn(),
}));

const engineMocks = vi.hoisted(() => ({
  performPCA: vi.fn(),
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

vi.mock('../../../api/services/dataService.js', () => ({
  fetchHistoryData: dataServiceMocks.fetchHistoryData,
}));

vi.mock('../../../api/engine/pca.js', () => ({
  performPCA: engineMocks.performPCA,
}));

vi.mock('../../../api/utils/logger.js', () => ({ logger: mockLogger(loggerMocks) }));

import pcaRoutes from '../../../api/routes/pcaRoutes.js';

function createValidRequest() {
  return {
    tickers: ['SPY', 'QQQ', 'IWM'],
    startDate: '2020-01-01',
    endDate: '2024-01-01',
  };
}

describe('pcaRoutes - POST /api/pca/analyze', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      SPY: { '2020-01-01': 300.0, '2020-01-02': 301.0 },
      QQQ: { '2020-01-01': 200.0, '2020-01-02': 201.0 },
      IWM: { '2020-01-01': 150.0, '2020-01-02': 151.0 },
    });
    engineMocks.performPCA.mockReturnValue({
      eigenvalues: [2.5, 0.3, 0.2],
      eigenvectors: [[0.5, 0.5, 0.5]],
      explainedVarianceRatio: [0.83, 0.1, 0.07],
      principalComponents: [[1, 2, 3]],
    });
    server = await startExpressApp((app) => app.use('/api/pca', pcaRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  it('有效参数应返回 PCA 分析结果', async () => {
    const res = await fetch(`${server.url}/api/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.eigenvalues).toHaveLength(3);
    expect(body.data.explainedVarianceRatio[0]).toBe(0.83);
    expect(engineMocks.performPCA).toHaveBeenCalledTimes(1);
  });

  it('应将 ticker 转大写并去重后调用 fetchHistoryData', async () => {
    const req = createValidRequest();
    req.tickers = ['spy', 'SPY', 'QQQ'];

    await fetch(`${server.url}/api/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    const callArgs = dataServiceMocks.fetchHistoryData.mock.calls[0];
    expect(callArgs[0]).toEqual(['SPY', 'QQQ']);
  });

  it('tickers 少于 2 个应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.tickers = ['SPY'];

    const res = await fetch(`${server.url}/api/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
    expect(engineMocks.performPCA).not.toHaveBeenCalled();
  });

  it('缺少 startDate 应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    delete (req as Record<string, unknown>).startDate;

    const res = await fetch(`${server.url}/api/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('空 tickers 数组应返回 400（zod 校验失败）', async () => {
    const req = createValidRequest();
    req.tickers = [];

    const res = await fetch(`${server.url}/api/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });

    expect(res.status).toBe(400);
  });

  it('重复 ticker 去重后不足 2 个应返回 400', async () => {
    const req = createValidRequest();
    req.tickers = ['SPY', 'spy'];

    const res = await fetch(`${server.url}/api/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.detail).toContain('至少需要 2 个资产');
  });

  it('部分标的价格数据缺失时应返回 400', async () => {
    dataServiceMocks.fetchHistoryData.mockResolvedValue({
      SPY: { '2020-01-01': 300.0 },
      QQQ: {},
      IWM: { '2020-01-01': 150.0 },
    });

    const res = await fetch(`${server.url}/api/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.detail).toContain('QQQ');
  });

  it('performPCA 抛错时应返回 500', async () => {
    engineMocks.performPCA.mockImplementation(() => {
      throw new Error('pca engine error');
    });

    const res = await fetch(`${server.url}/api/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createValidRequest()),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.detail).toBe('PCA 分析失败');
  });
});
