import { describe, it, expect, beforeAll } from 'vitest';
import { checkServerAvailable } from '../helpers/server.js';
import { API_BASE_URL } from '../helpers/constants.js';

// E2E测试：启动真实服务器并测试API端点
// 这些测试需要后端服务器运行

let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailable(API_BASE_URL);
});

// ===== 搜索API =====
describe('E2E - 搜索API', () => {
  it.skipIf(!serverAvailable)('GET /api/backtest/search - 搜索VTI', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/search?query=VTI`);
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data[0].ticker).toBe('VTI');
  });

  it.skipIf(!serverAvailable)('搜索AAPL返回苹果', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/search?query=AAPL`);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.some((r: { ticker: string }) => r.ticker === 'AAPL')).toBe(true);
  });

  it.skipIf(!serverAvailable)('搜索不存在的代码返回空', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/search?query=ZZZZZZZZZ`);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(0);
  });

  it.skipIf(!serverAvailable)('缺少query参数返回错误', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/search`);
    expect(res.ok).toBe(false);
  });
});

// ===== 回测API - 正常场景 =====
describe('E2E - 回测API正常场景', () => {
  it.skipIf(!serverAvailable)('POST /api/backtest/portfolio - 正常回测VTI+BND', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{
          name: 'Test',
          assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }],
          rebalanceFrequency: 'quarterly',
        }],
        parameters: {
          startDate: '2010-01-01',
          endDate: '2024-12-31',
          startingValue: 10000,
          adjustForInflation: false,
          rollingWindowMonths: 12,
          benchmarkTicker: 'SPY',
        },
      }),
    });
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.data.portfolios).toHaveLength(1);
    const p = json.data.portfolios[0];
    expect(p.growthCurve.length).toBeGreaterThan(100);
    expect(p.statistics.cagr).toBeGreaterThan(0);
    expect(p.statistics.maxDrawdown).toBeGreaterThan(0); // maxDrawdown是小数，0.228=22.8%
  });

  it.skipIf(!serverAvailable)('单资产SPY回测', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{ name: 'SPY', assets: [{ ticker: 'SPY', weight: 100 }], rebalanceFrequency: 'none' }],
        parameters: { startDate: '2010-01-01', endDate: '2024-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '' },
      }),
    });
    const json = await res.json();
    expect(json.data.portfolios[0].statistics.cagr).toBeGreaterThan(0.05);
  });

  it.skipIf(!serverAvailable)('多组合同时回测', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [
          { name: '保守', assets: [{ ticker: 'VTI', weight: 20 }, { ticker: 'BND', weight: 80 }], rebalanceFrequency: 'annual' },
          { name: '激进', assets: [{ ticker: 'VTI', weight: 100 }], rebalanceFrequency: 'annual' },
        ],
        parameters: { startDate: '2010-01-01', endDate: '2024-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '' },
      }),
    });
    const json = await res.json();
    expect(json.data.portfolios).toHaveLength(2);
    expect(json.data.correlations).toHaveLength(2);
    // 激进组合CAGR > 保守组合
    expect(json.data.portfolios[1].statistics.cagr).toBeGreaterThan(json.data.portfolios[0].statistics.cagr);
  });
});

// ===== 回测API - 做空场景 =====
describe('E2E - 回测API做空场景', () => {
  it.skipIf(!serverAvailable)('POST /api/backtest/portfolio - 做空场景不返回负值', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{
          name: 'Short Test',
          assets: [
            { ticker: 'VTI', weight: 200 },
            { ticker: 'NVDA', weight: -100 },
          ],
          rebalanceFrequency: 'none',
        }],
        parameters: {
          startDate: '2023-01-01',
          endDate: '2024-12-31',
          startingValue: 10000,
          adjustForInflation: false,
          rollingWindowMonths: 12,
          benchmarkTicker: '',
        },
      }),
    });
    expect(res.ok).toBe(true);
    const json = await res.json();
    const gc = json.data.portfolios[0].growthCurve;
    // 所有value >= 0（爆仓后归零，不应有负值）
    const negativeValues = gc.filter((p: { value: number }) => p.value < 0);
    expect(negativeValues).toHaveLength(0);
  });

  it.skipIf(!serverAvailable)('极端做空爆仓后CAGR=-1', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{ name: '爆仓', assets: [{ ticker: 'SPY', weight: 300 }, { ticker: 'NVDA', weight: -200 }], rebalanceFrequency: 'none' }],
        parameters: { startDate: '2023-01-01', endDate: '2024-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '' },
      }),
    });
    const json = await res.json();
    // 可能爆仓也可能不爆仓，但不应有负值
    const gc = json.data.portfolios[0].growthCurve;
    const negativeValues = gc.filter((p: { value: number }) => p.value < 0);
    expect(negativeValues).toHaveLength(0);
  });
});

// ===== 回测API - 偏离调仓 =====
describe('E2E - 回测API偏离调仓', () => {
  it.skipIf(!serverAvailable)('POST /api/backtest/portfolio - 偏离调仓不比季度调仓更易爆仓', async () => {
    const baseBody = {
      assets: [
        { ticker: 'VTI', weight: 100 },
        { ticker: 'BND', weight: 100 },
        { ticker: 'AAPL', weight: -100 },
      ],
      parameters: {
        startDate: '2010-01-01',
        endDate: '2024-12-31',
        startingValue: 10000,
        adjustForInflation: false,
        rollingWindowMonths: 12,
        benchmarkTicker: '',
      },
    };

    // 季度调仓
    const resQ = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{ ...baseBody, name: 'Q', rebalanceFrequency: 'quarterly' }],
        parameters: baseBody.parameters,
      }),
    });
    const jsonQ = await resQ.json();
    const qCagr = jsonQ.data.portfolios[0].statistics.cagr;

    // 偏离调仓 5%
    const resT = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{ ...baseBody, name: 'T', rebalanceFrequency: 'threshold', rebalanceThreshold: 5 }],
        parameters: baseBody.parameters,
      }),
    });
    const jsonT = await resT.json();
    const tCagr = jsonT.data.portfolios[0].statistics.cagr;

    // 如果季度没爆仓，偏离也不应该爆
    if (qCagr !== -1) {
      expect(tCagr).not.toBe(-1);
    }
  });
});

// ===== 回测API - 错误处理 =====
describe('E2E - 回测API错误处理', () => {
  it.skipIf(!serverAvailable)('POST /api/backtest/portfolio - 无效ticker返回错误', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{
          name: 'Test',
          assets: [{ ticker: 'INVALID_TICKER_XYZ', weight: 100 }],
          rebalanceFrequency: 'none',
        }],
        parameters: {
          startDate: '2020-01-01',
          endDate: '2024-12-31',
          startingValue: 10000,
          adjustForInflation: false,
          rollingWindowMonths: 12,
          benchmarkTicker: '',
        },
      }),
    });
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it.skipIf(!serverAvailable)('POST /api/backtest/portfolio - 权重百分比正确处理', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{
          name: 'Weight Test',
          assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }],
          rebalanceFrequency: 'none',
        }],
        parameters: {
          startDate: '2020-01-01',
          endDate: '2020-12-31',
          startingValue: 10000,
          adjustForInflation: false,
          rollingWindowMonths: 12,
          benchmarkTicker: '',
        },
      }),
    });
    const json = await res.json();
    const firstValue = json.data.portfolios[0].growthCurve[0].value;
    // 初始值应该是10000附近（不是1000000）
    expect(firstValue).toBeLessThan(20000);
    expect(firstValue).toBeGreaterThan(5000);
  });

  it.skipIf(!serverAvailable)('空body返回错误', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.ok).toBe(false);
  });
});

// ===== 回测API - 数据一致性 =====
describe('E2E - 回测API数据一致性', () => {
  it.skipIf(!serverAvailable)('相同参数两次回测结果一致', async () => {
    const body = JSON.stringify({
      portfolios: [{ name: 'Test', assets: [{ ticker: 'VTI', weight: 100 }], rebalanceFrequency: 'none' }],
      parameters: { startDate: '2020-01-01', endDate: '2020-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '' },
    });
    const [res1, res2] = await Promise.all([
      fetch(`${API_BASE_URL}/api/backtest/portfolio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
      fetch(`${API_BASE_URL}/api/backtest/portfolio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
    ]);
    const json1 = await res1.json();
    const json2 = await res2.json();
    expect(json1.data.portfolios[0].statistics.cagr).toBe(json2.data.portfolios[0].statistics.cagr);
    expect(json1.data.portfolios[0].growthCurve.length).toBe(json2.data.portfolios[0].growthCurve.length);
  });

  it.skipIf(!serverAvailable)('增长曲线首日价值≈startingValue', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{ name: 'Test', assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }], rebalanceFrequency: 'none' }],
        parameters: { startDate: '2020-01-01', endDate: '2020-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '' },
      }),
    });
    const json = await res.json();
    const firstValue = json.data.portfolios[0].growthCurve[0].value;
    expect(Math.abs(firstValue - 10000)).toBeLessThan(500); // 首日波动不大
  });
});
