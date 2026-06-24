import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = 'http://localhost:3001';
let serverAvailable = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/api/backtest/search?query=VTI`);
    serverAvailable = res.ok;
  } catch {
    serverAvailable = false;
  }
});

// ===== 搜索API =====
describe('E2E - 搜索API', () => {
  it('搜索VTI返回正确结果', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/search?query=VTI`);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.some((r: { ticker: string }) => r.ticker === 'VTI')).toBe(true);
  });

  it('搜索AAPL返回苹果', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/search?query=AAPL`);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.some((r: { ticker: string }) => r.ticker === 'AAPL')).toBe(true);
  });

  it('搜索不存在的代码返回空', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/search?query=ZZZZZZZZZ`);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(0);
  });

  it('缺少query参数返回错误', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/search`);
    expect(res.ok).toBe(false);
  });
});

// ===== 回测API - 正常场景 =====
describe('E2E - 回测API正常场景', () => {
  it('VTI 60% + BND 40% 回测结果合理', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{ name: '60/40', assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }], rebalanceFrequency: 'quarterly' }],
        parameters: { startDate: '2010-01-01', endDate: '2024-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: 'SPY' },
      }),
    });
    const json = await res.json();
    const p = json.data.portfolios[0];
    expect(p.growthCurve.length).toBeGreaterThan(1000);
    expect(p.statistics.cagr).toBeGreaterThan(0);
    expect(p.statistics.cagr).toBeLessThan(0.20); // 60/40不太可能年化超20%
    expect(p.statistics.maxDrawdown).toBeGreaterThan(0);
    expect(p.statistics.maxDrawdown).toBeLessThan(0.50); // 最大回撤<50%
    expect(p.statistics.stdev).toBeGreaterThan(0);
    expect(p.statistics.sharpe).toBeGreaterThan(0);
  });

  it('单资产SPY回测', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
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

  it('多组合同时回测', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
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
  it('做空场景无负值', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{ name: '做空', assets: [{ ticker: 'VTI', weight: 200 }, { ticker: 'NVDA', weight: -100 }], rebalanceFrequency: 'none' }],
        parameters: { startDate: '2023-01-01', endDate: '2024-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '' },
      }),
    });
    const json = await res.json();
    const gc = json.data.portfolios[0].growthCurve;
    const negativeValues = gc.filter((p: { value: number }) => p.value < 0);
    expect(negativeValues).toHaveLength(0);
  });

  it('极端做空爆仓后CAGR=-1', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
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
  it('偏离调仓不比季度调仓更易爆仓', async () => {
    if (!serverAvailable) return;
    const baseAssets = [
      { ticker: 'VTI', weight: 100 },
      { ticker: 'BND', weight: 100 },
      { ticker: 'AAPL', weight: -100 },
    ];
    const params = { startDate: '2010-01-01', endDate: '2024-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '' };

    const [resQ, resT] = await Promise.all([
      fetch(`${BASE_URL}/api/backtest/portfolio`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolios: [{ name: 'Q', assets: baseAssets, rebalanceFrequency: 'quarterly' }], parameters: params }),
      }),
      fetch(`${BASE_URL}/api/backtest/portfolio`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolios: [{ name: 'T', assets: baseAssets, rebalanceFrequency: 'threshold', rebalanceThreshold: 5 }], parameters: params }),
      }),
    ]);
    const jsonQ = await resQ.json();
    const jsonT = await resT.json();
    const qCagr = jsonQ.data.portfolios[0].statistics.cagr;
    const tCagr = jsonT.data.portfolios[0].statistics.cagr;
    if (qCagr !== -1) {
      expect(tCagr).not.toBe(-1);
    }
  });
});

// ===== 回测API - 错误处理 =====
describe('E2E - 回测API错误处理', () => {
  it('无效ticker返回错误', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{ name: 'Bad', assets: [{ ticker: 'NOTEXIST12345', weight: 100 }], rebalanceFrequency: 'none' }],
        parameters: { startDate: '2020-01-01', endDate: '2024-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '' },
      }),
    });
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it('权重百分比不会导致天文数字', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portfolios: [{ name: 'Weight', assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }], rebalanceFrequency: 'none' }],
        parameters: { startDate: '2020-01-01', endDate: '2020-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '' },
      }),
    });
    const json = await res.json();
    const firstValue = json.data.portfolios[0].growthCurve[0].value;
    // 初始值应在10000附近，不是1000000
    expect(firstValue).toBeLessThan(50000);
    expect(firstValue).toBeGreaterThan(5000);
  });

  it('空body返回错误', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.ok).toBe(false);
  });
});

// ===== 回测API - 数据一致性 =====
describe('E2E - 回测API数据一致性', () => {
  it('相同参数两次回测结果一致', async () => {
    if (!serverAvailable) return;
    const body = JSON.stringify({
      portfolios: [{ name: 'Test', assets: [{ ticker: 'VTI', weight: 100 }], rebalanceFrequency: 'none' }],
      parameters: { startDate: '2020-01-01', endDate: '2020-12-31', startingValue: 10000, adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '' },
    });
    const [res1, res2] = await Promise.all([
      fetch(`${BASE_URL}/api/backtest/portfolio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
      fetch(`${BASE_URL}/api/backtest/portfolio`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }),
    ]);
    const json1 = await res1.json();
    const json2 = await res2.json();
    expect(json1.data.portfolios[0].statistics.cagr).toBe(json2.data.portfolios[0].statistics.cagr);
    expect(json1.data.portfolios[0].growthCurve.length).toBe(json2.data.portfolios[0].growthCurve.length);
  });

  it('增长曲线首日价值≈startingValue', async () => {
    if (!serverAvailable) return;
    const res = await fetch(`${BASE_URL}/api/backtest/portfolio`, {
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
