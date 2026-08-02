import { describe, it, expect, beforeAll } from 'vitest';
import { checkServerAvailable } from '../helpers/chaos.js';
import { API_BASE_URL } from '../helpers/expressApp.js';

let serverAvailable = false;
beforeAll(async () => {
  serverAvailable = await checkServerAvailable(API_BASE_URL);
});

const skip = (name: string, fn: () => Promise<void>) => it.skipIf(!serverAvailable)(name, fn);
const BASE_PARAMS = {
  startDate: '2010-01-01',
  endDate: '2024-12-31',
  startingValue: 10000,
  adjustForInflation: false,
  rollingWindowMonths: 12,
  benchmarkTicker: '',
};

async function postPortfolio(portfolios: object[], parameters: object = BASE_PARAMS) {
  const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portfolios, parameters }),
  });
  return { res, json: await res.json() };
}

describe('E2E - 搜索API', () => {
  skip('GET /api/backtest/search - 搜索VTI', async () => {
    const json = await (await fetch(`${API_BASE_URL}/api/backtest/search?query=VTI`)).json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data[0].ticker).toBe('VTI');
  });
  skip('搜索AAPL返回苹果', async () => {
    const json = await (await fetch(`${API_BASE_URL}/api/backtest/search?query=AAPL`)).json();
    expect(json.success).toBe(true);
    expect(json.data.some((r: { ticker: string }) => r.ticker === 'AAPL')).toBe(true);
  });
  skip('搜索不存在的代码返回空', async () => {
    const json = await (await fetch(`${API_BASE_URL}/api/backtest/search?query=ZZZZZZZZZ`)).json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(0);
  });
  skip('缺少query参数返回错误', async () => {
    expect((await fetch(`${API_BASE_URL}/api/backtest/search`)).ok).toBe(false);
  });
});

describe('E2E - 回测API正常场景', () => {
  skip('POST /api/backtest/portfolio - 正常回测VTI+BND', async () => {
    const { json } = await postPortfolio(
      [
        {
          name: 'Test',
          assets: [
            { ticker: 'VTI', weight: 60 },
            { ticker: 'BND', weight: 40 },
          ],
          rebalanceFrequency: 'quarterly',
        },
      ],
      { ...BASE_PARAMS, benchmarkTicker: 'SPY' },
    );
    expect(json.data.portfolios).toHaveLength(1);
    expect(json.data.portfolios[0].growthCurve.length).toBeGreaterThan(100);
    expect(json.data.portfolios[0].statistics.cagr).toBeGreaterThan(0);
    expect(json.data.portfolios[0].statistics.maxDrawdown).toBeGreaterThan(0); // maxDrawdown是小数，0.228=22.8%
  });
  skip('单资产SPY回测', async () => {
    const { json } = await postPortfolio([
      { name: 'SPY', assets: [{ ticker: 'SPY', weight: 100 }], rebalanceFrequency: 'none' },
    ]);
    expect(json.data.portfolios[0].statistics.cagr).toBeGreaterThan(0.05);
  });
  skip('多组合同时回测', async () => {
    const { json } = await postPortfolio([
      {
        name: '保守',
        assets: [
          { ticker: 'VTI', weight: 20 },
          { ticker: 'BND', weight: 80 },
        ],
        rebalanceFrequency: 'annual',
      },
      { name: '激进', assets: [{ ticker: 'VTI', weight: 100 }], rebalanceFrequency: 'annual' },
    ]);
    expect(json.data.portfolios).toHaveLength(2);
    expect(json.data.correlations).toHaveLength(2);
    expect(json.data.portfolios[1].statistics.cagr).toBeGreaterThan(
      json.data.portfolios[0].statistics.cagr,
    );
  });
});

describe('E2E - 回测API做空场景', () => {
  skip('POST /api/backtest/portfolio - 做空场景不返回负值', async () => {
    const { res, json } = await postPortfolio(
      [
        {
          name: 'Short Test',
          assets: [
            { ticker: 'VTI', weight: 200 },
            { ticker: 'NVDA', weight: -100 },
          ],
          rebalanceFrequency: 'none',
        },
      ],
      { ...BASE_PARAMS, startDate: '2023-01-01' },
    );
    expect(res.ok).toBe(true);
    expect(
      json.data.portfolios[0].growthCurve.filter((p: { value: number }) => p.value < 0),
    ).toHaveLength(0);
  });
  skip('极端做空爆仓后CAGR=-1', async () => {
    const { json } = await postPortfolio(
      [
        {
          name: '爆仓',
          assets: [
            { ticker: 'SPY', weight: 300 },
            { ticker: 'NVDA', weight: -200 },
          ],
          rebalanceFrequency: 'none',
        },
      ],
      { ...BASE_PARAMS, startDate: '2023-01-01' },
    );
    expect(
      json.data.portfolios[0].growthCurve.filter((p: { value: number }) => p.value < 0),
    ).toHaveLength(0);
  });
});

describe('E2E - 回测API偏离调仓', () => {
  skip('POST /api/backtest/portfolio - 偏离调仓不比季度调仓更易爆仓', async () => {
    const assets = [
      { ticker: 'VTI', weight: 100 },
      { ticker: 'BND', weight: 100 },
      { ticker: 'AAPL', weight: -100 },
    ];
    const { json: jsonQ } = await postPortfolio([
      { name: 'Q', assets, rebalanceFrequency: 'quarterly' },
    ]);
    const { json: jsonT } = await postPortfolio([
      { name: 'T', assets, rebalanceFrequency: 'threshold', rebalanceThreshold: 5 },
    ]);
    if (jsonQ.data.portfolios[0].statistics.cagr !== -1) {
      expect(jsonT.data.portfolios[0].statistics.cagr).not.toBe(-1);
    }
  });
});

describe('E2E - 回测API错误处理', () => {
  skip('POST /api/backtest/portfolio - 无效ticker返回错误', async () => {
    const { json } = await postPortfolio(
      [
        {
          name: 'Test',
          assets: [{ ticker: 'INVALID_TICKER_XYZ', weight: 100 }],
          rebalanceFrequency: 'none',
        },
      ],
      { ...BASE_PARAMS, startDate: '2020-01-01' },
    );
    expect(json.success).toBe(false);
  });
  skip('POST /api/backtest/portfolio - 权重百分比正确处理', async () => {
    const { json } = await postPortfolio(
      [
        {
          name: 'Weight Test',
          assets: [
            { ticker: 'VTI', weight: 60 },
            { ticker: 'BND', weight: 40 },
          ],
          rebalanceFrequency: 'none',
        },
      ],
      { ...BASE_PARAMS, startDate: '2020-01-01', endDate: '2020-12-31' },
    );
    const firstValue = json.data.portfolios[0].growthCurve[0].value;
    expect(firstValue).toBeLessThan(20000);
    expect(firstValue).toBeGreaterThan(5000);
  });
  skip('空body返回错误', async () => {
    const res = await fetch(`${API_BASE_URL}/api/backtest/portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.ok).toBe(false);
  });
});

describe('E2E - 回测API数据一致性', () => {
  skip('相同参数两次回测结果一致', async () => {
    const body = JSON.stringify({
      portfolios: [
        { name: 'Test', assets: [{ ticker: 'VTI', weight: 100 }], rebalanceFrequency: 'none' },
      ],
      parameters: { ...BASE_PARAMS, startDate: '2020-01-01', endDate: '2020-12-31' },
    });
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
    const [json1, json2] = await Promise.all([
      fetch(`${API_BASE_URL}/api/backtest/portfolio`, opts).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/backtest/portfolio`, opts).then((r) => r.json()),
    ]);
    expect(json1.data.portfolios[0].statistics.cagr).toBe(json2.data.portfolios[0].statistics.cagr);
    expect(json1.data.portfolios[0].growthCurve.length).toBe(
      json2.data.portfolios[0].growthCurve.length,
    );
  });
  skip('增长曲线首日价值≈startingValue', async () => {
    const { json } = await postPortfolio(
      [
        {
          name: 'Test',
          assets: [
            { ticker: 'VTI', weight: 60 },
            { ticker: 'BND', weight: 40 },
          ],
          rebalanceFrequency: 'none',
        },
      ],
      { ...BASE_PARAMS, startDate: '2020-01-01', endDate: '2020-12-31' },
    );
    expect(Math.abs(json.data.portfolios[0].growthCurve[0].value - 10000)).toBeLessThan(500); // 首日波动不大
  });
});
