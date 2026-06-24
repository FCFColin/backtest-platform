import { describe, it, expect, beforeAll } from 'vitest';

// E2E测试：启动真实服务器并测试API端点
// 这些测试需要后端服务器运行

const BASE_URL = 'http://localhost:5001';

describe('API E2E - 回测接口', () => {
  // 检查服务器是否可用
  let serverAvailable = false;

  beforeAll(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/backtest/search?query=VTI`);
      serverAvailable = res.ok;
    } catch {
      serverAvailable = false;
    }
  });

  it('GET /api/backtest/search - 搜索VTI', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/search?query=VTI`);
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data[0].ticker).toBe('VTI');
  });

  it('POST /api/backtest/portfolio - 正常回测VTI+BND', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
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

  it('POST /api/backtest/portfolio - 无效ticker返回错误', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
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

  it('POST /api/backtest/portfolio - 做空场景不返回负值', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
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

  it('POST /api/backtest/portfolio - 偏离调仓不比季度调仓更易爆仓', async () => {
    if (!serverAvailable) return;
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
    const resQ = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
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
    const resT = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
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

  it('POST /api/backtest/portfolio - 权重百分比正确处理', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
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
});
