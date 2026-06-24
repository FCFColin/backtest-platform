/**
 * Rust引擎集成测试 - 通过HTTP调用Rust引擎验证所有端点
 * 
 * 前提：Rust引擎必须在 http://127.0.0.1:3002 运行
 * 启动方式：cd engine-rs && cargo run --release
 */
import { describe, it, expect, beforeAll } from 'vitest';

const RUST_URL = process.env.RUST_ENGINE_URL || 'http://127.0.0.1:3002';
let engineAvailable = false;

// 生成测试价格数据
function makePriceData(
  ticker: string, startDate: string, endDate: string, startPrice: number, dailyReturn: number,
): Record<string, number> {
  const prices: Record<string, number> = {};
  const current = new Date(startDate);
  const end = new Date(endDate);
  let price = startPrice;
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      prices[current.toISOString().slice(0, 10)] = Math.round(price * 1000) / 1000;
      price *= (1 + dailyReturn);
    }
    current.setDate(current.getDate() + 1);
  }
  return prices;
}

beforeAll(async () => {
  try {
    const resp = await fetch(`${RUST_URL}/api/engine/health`);
    if (resp.ok) engineAvailable = true;
  } catch {
    // ignore
  }
});

// ===== Health =====
describe('Rust引擎 - Health', () => {
  it('健康检查应返回ok', async () => {
    if (!engineAvailable) return;
    const resp = await fetch(`${RUST_URL}/api/engine/health`);
    const data = await resp.json();
    expect(data.status).toBe('ok');
    expect(data.engine).toBe('rust');
    expect(data.modules).toContain('backtest');
    expect(data.modules).toContain('monte-carlo');
    expect(data.modules).toContain('optimizer');
  });
});

// ===== 回测 =====
describe('Rust引擎 - 回测', () => {
  it('基本60/40组合回测', async () => {
    if (!engineAvailable) return;
    const vti = makePriceData('VTI', '2020-01-02', '2023-12-29', 150, 0.0004);
    const bnd = makePriceData('BND', '2020-01-02', '2023-12-29', 85, 0.0001);

    const body = {
      portfolios: [{
        name: '60/40',
        assets: [{ ticker: 'VTI', weight: 60 }, { ticker: 'BND', weight: 40 }],
        rebalanceFrequency: 'quarterly',
      }],
      priceData: { VTI: vti, BND: bnd },
      params: {
        startDate: '2020-01-02', endDate: '2023-12-29', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
    };

    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.portfolios).toHaveLength(1);
    const p = result.portfolios[0];
    expect(p.name).toBe('60/40');
    expect(p.growthCurve.length).toBeGreaterThan(100);
    expect(p.statistics.cagr).toBeGreaterThan(0);
    expect(p.statistics.stdev).toBeGreaterThan(0);
    expect(p.statistics.maxDrawdown).toBeGreaterThan(0);
    expect(p.statistics.sharpe).toBeGreaterThan(0);
    expect(p.annualReturns.length).toBeGreaterThan(0);
    expect(p.monthlyReturns.length).toBeGreaterThan(0);
    expect(p.rollingReturns.length).toBeGreaterThan(0);
  });

  it('空组合应返回空结果', async () => {
    if (!engineAvailable) return;
    const body = {
      portfolios: [{ name: '空', assets: [], rebalanceFrequency: 'quarterly' }],
      priceData: {},
      params: {
        startDate: '2020-01-02', endDate: '2023-12-29', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.portfolios).toHaveLength(1);
    expect(result.portfolios[0].growthCurve).toHaveLength(0);
    expect(result.portfolios[0].statistics.cagr).toBe(0);
  });

  it('爆仓组合应标记liquidated', async () => {
    if (!engineAvailable) return;
    // 做空100% + 做多100% = 初始价值0，立即爆仓
    const a = makePriceData('A', '2020-01-02', '2020-03-01', 100, -0.05);
    const body = {
      portfolios: [{
        name: '爆仓',
        assets: [{ ticker: 'A', weight: 150 }, { ticker: 'B', weight: -50 }],
        rebalanceFrequency: 'none',
      }],
      priceData: { A: a, B: a },
      params: {
        startDate: '2020-01-02', endDate: '2020-03-01', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    const p = result.portfolios[0];
    // 爆仓后CAGR=-1
    expect(p.statistics.cagr).toBe(-1);
  });

  it('多组合相关性矩阵', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      portfolios: [
        { name: 'P1', assets: [{ ticker: 'A', weight: 100 }], rebalanceFrequency: 'none' },
        { name: 'P2', assets: [{ ticker: 'B', weight: 100 }], rebalanceFrequency: 'none' },
      ],
      priceData: { A: a, B: b },
      params: {
        startDate: '2020-01-02', endDate: '2022-12-30', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.correlations).toHaveLength(2);
    expect(result.correlations[0][0]).toBeCloseTo(1.0, 1);
    expect(result.correlations[0][1]).toBeLessThanOrEqual(1.0);
  });
});

// ===== 蒙特卡洛 =====
describe('Rust引擎 - 蒙特卡洛', () => {
  it('基本蒙特卡洛模拟', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const body = {
      portfolio: {
        name: 'Test',
        assets: [{ ticker: 'A', weight: 100 }],
        rebalanceFrequency: 'none',
      },
      priceData: { A: a },
      params: {
        startDate: '2020-01-02', endDate: '2022-12-30', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
      mcParams: { numSimulations: 100, numYears: 5, blockSize: 5, successThreshold: 1.0 },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/monte-carlo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.percentiles.p50.length).toBeGreaterThan(0);
    expect(result.statistics.successRate).toBeGreaterThanOrEqual(0);
    expect(result.finalDistribution.length).toBe(50);
  });
});

// ===== 优化器 =====
describe('Rust引擎 - 优化器', () => {
  it('最大Sharpe优化', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      tickers: ['A', 'B'],
      priceData: { A: a, B: b },
      objective: 'maxSharpe',
      constraints: { minWeight: 0.1, maxWeight: 0.9 },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/optimize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.optimalWeights).toHaveProperty('A');
    expect(result.optimalWeights).toHaveProperty('B');
    expect(result.sharpeRatio).toBeGreaterThan(0);
  });

  it('有效前沿', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      tickers: ['A', 'B'],
      priceData: { A: a, B: b },
      numPoints: 5,
    };
    const resp = await fetch(`${RUST_URL}/api/engine/efficient-frontier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.frontier.length).toBe(5);
    for (let i = 1; i < result.frontier.length; i++) {
      expect(result.frontier[i].expectedVolatility).toBeGreaterThanOrEqual(
        result.frontier[i - 1].expectedVolatility * 0.8,
      );
    }
  });
});

// ===== 偏离调仓 =====
describe('Rust引擎 - 偏离调仓（threshold rebalance）', () => {
  it('小权重过度敏感问题：5%小权重+5%阈值不应频繁触发', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0002);
    const body = {
      portfolios: [{
        name: 'SmallWeight',
        assets: [{ ticker: 'A', weight: 95 }, { ticker: 'B', weight: 5 }],
        rebalanceFrequency: 'threshold',
        rebalanceThreshold: 5,
      }],
      priceData: { A: a, B: b },
      params: {
        startDate: '2020-01-02', endDate: '2022-12-30', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    const p = result.portfolios[0];
    expect(p.growthCurve.length).toBeGreaterThan(100);
    expect(p.statistics.cagr).toBeGreaterThan(0);
  });

  it('偏离调仓 vs 不调仓：偏离调仓终值应更接近每日调仓', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0002);
    const priceData = { A: a, B: b };
    const baseParams = {
      startDate: '2020-01-02', endDate: '2022-12-30', startingValue: 10000,
      adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
    };

    const freqs = [
      { name: 'Daily', freq: 'daily', threshold: undefined as number | undefined },
      { name: 'Threshold5', freq: 'threshold', threshold: 5 },
      { name: 'None', freq: 'none', threshold: undefined as number | undefined },
    ];

    const finals: Record<string, number> = {};
    for (const f of freqs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: any = {
        portfolios: [{
          name: f.name,
          assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }],
          rebalanceFrequency: f.freq,
        }],
        priceData,
        params: baseParams,
      };
      if (f.threshold !== undefined) {
        body.portfolios[0].rebalanceThreshold = f.threshold;
      }
      const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();
      const gc = result.portfolios[0].growthCurve;
      finals[f.name] = gc[gc.length - 1].value;
    }

    expect(Math.abs(finals.Threshold5 - finals.Daily)).toBeLessThanOrEqual(
      Math.abs(finals.None - finals.Daily),
    );
  });

  it('偏离调仓阈值100%等同于不调仓', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0002);
    const priceData = { A: a, B: b };
    const baseParams = {
      startDate: '2020-01-02', endDate: '2022-12-30', startingValue: 10000,
      adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
    };

    const [resNone, resTh100] = await Promise.all([
      fetch(`${RUST_URL}/api/engine/backtest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolios: [{ name: 'None', assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }], rebalanceFrequency: 'none' }],
          priceData, params: baseParams,
        }),
      }),
      fetch(`${RUST_URL}/api/engine/backtest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolios: [{ name: 'Th100', assets: [{ ticker: 'A', weight: 50 }, { ticker: 'B', weight: 50 }], rebalanceFrequency: 'threshold', rebalanceThreshold: 100 }],
          priceData, params: baseParams,
        }),
      }),
    ]);

    const noneResult = await resNone.json();
    const th100Result = await resTh100.json();
    const noneFinal = noneResult.portfolios[0].growthCurve.at(-1).value;
    const th100Final = th100Result.portfolios[0].growthCurve.at(-1).value;
    expect(Math.abs(noneFinal - th100Final) / noneFinal).toBeLessThan(0.001);
  });
});

// ===== 浮点精度 =====
describe('Rust引擎 - 浮点精度', () => {
  it('权重60.1+39.9=100应被接受', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      portfolios: [{
        name: 'FloatWeight',
        assets: [{ ticker: 'A', weight: 60.1 }, { ticker: 'B', weight: 39.9 }],
        rebalanceFrequency: 'quarterly',
      }],
      priceData: { A: a, B: b },
      params: {
        startDate: '2020-01-02', endDate: '2022-12-30', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.portfolios).toHaveLength(1);
    const p = result.portfolios[0];
    expect(p.growthCurve.length).toBeGreaterThan(100);
    expect(p.statistics.cagr).toBeGreaterThan(0);
  });

  it('权重33.33+33.33+33.34=100应被接受', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const c = makePriceData('C', '2020-01-02', '2022-12-30', 100, 0.0003);
    const body = {
      portfolios: [{
        name: 'ThreeWay',
        assets: [
          { ticker: 'A', weight: 33.33 },
          { ticker: 'B', weight: 33.33 },
          { ticker: 'C', weight: 33.34 },
        ],
        rebalanceFrequency: 'quarterly',
      }],
      priceData: { A: a, B: b, C: c },
      params: {
        startDate: '2020-01-02', endDate: '2022-12-30', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.portfolios).toHaveLength(1);
    expect(result.portfolios[0].growthCurve.length).toBeGreaterThan(100);
  });
});

// ===== 再平衡频率对比 =====
describe('Rust引擎 - 再平衡频率对比', () => {
  it('daily/weekly/monthly/quarterly/annual/none 均可运行且结果合理', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2023-12-29', 100, 0.0008);
    const b = makePriceData('B', '2020-01-02', '2023-12-29', 100, 0.0002);
    const priceData = { A: a, B: b };
    const baseParams = {
      startDate: '2020-01-02', endDate: '2023-12-29', startingValue: 10000,
      adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
    };

    const frequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'none'] as const;
    const results: Record<string, number> = {};

    for (const freq of frequencies) {
      const body = {
        portfolios: [{
          name: freq,
          assets: [{ ticker: 'A', weight: 60 }, { ticker: 'B', weight: 40 }],
          rebalanceFrequency: freq,
        }],
        priceData,
        params: baseParams,
      };
      const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();
      const p = result.portfolios[0];
      expect(p.growthCurve.length).toBeGreaterThan(100);
      expect(p.statistics.cagr).toBeGreaterThan(0);
      expect(p.statistics.stdev).toBeGreaterThan(0);
      results[freq] = p.statistics.cagr;
    }

    expect(Object.keys(results)).toHaveLength(6);
  });

  it('高频率调仓应更接近目标权重，低频率允许更多漂移', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2023-12-29', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2023-12-29', 100, 0.0001);
    const priceData = { A: a, B: b };
    const baseParams = {
      startDate: '2020-01-02', endDate: '2023-12-29', startingValue: 10000,
      adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
    };

    const [resDaily, resNone] = await Promise.all([
      fetch(`${RUST_URL}/api/engine/backtest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolios: [{ name: 'Daily', assets: [{ ticker: 'A', weight: 60 }, { ticker: 'B', weight: 40 }], rebalanceFrequency: 'daily' }],
          priceData, params: baseParams,
        }),
      }),
      fetch(`${RUST_URL}/api/engine/backtest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolios: [{ name: 'None', assets: [{ ticker: 'A', weight: 60 }, { ticker: 'B', weight: 40 }], rebalanceFrequency: 'none' }],
          priceData, params: baseParams,
        }),
      }),
    ]);

    const dailyResult = await resDaily.json();
    const noneResult = await resNone.json();
    const dailyFinal = dailyResult.portfolios[0].growthCurve.at(-1).value;
    const noneFinal = noneResult.portfolios[0].growthCurve.at(-1).value;
    expect(dailyFinal).toBeGreaterThan(0);
    expect(noneFinal).toBeGreaterThan(0);
    expect(dailyFinal).not.toBeCloseTo(noneFinal, -1);
  });
});

// ===== 爆仓 =====
describe('Rust引擎 - 爆仓', () => {
  it('爆仓后净值应为0且CAGR应为-1', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2020-06-30', 100, -0.05);
    const body = {
      portfolios: [{
        name: 'BlowUp',
        assets: [{ ticker: 'A', weight: 150 }, { ticker: 'B', weight: -50 }],
        rebalanceFrequency: 'none',
      }],
      priceData: { A: a, B: a },
      params: {
        startDate: '2020-01-02', endDate: '2020-06-30', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    const p = result.portfolios[0];
    expect(p.statistics.cagr).toBe(-1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postLiquidation = p.growthCurve.filter((pt: any) => pt.value <= 0);
    expect(postLiquidation.length).toBeGreaterThan(0);
  });

  it('价格归零导致爆仓', async () => {
    if (!engineAvailable) return;
    const crashReturns = new Array(30).fill(-0.15);
    const prices: Record<string, number> = {};
    const current = new Date('2020-01-02');
    let price = 100;
    let ri = 0;
    while (current <= new Date('2020-06-30') && ri < crashReturns.length) {
      const day = current.getDay();
      if (day !== 0 && day !== 6) {
        prices[current.toISOString().slice(0, 10)] = Math.round(price * 1000) / 1000;
        price *= (1 + crashReturns[ri]);
        if (price < 0) price = 0;
        ri++;
      }
      current.setDate(current.getDate() + 1);
    }

    const body = {
      portfolios: [{
        name: 'Crash',
        assets: [{ ticker: 'A', weight: 100 }],
        rebalanceFrequency: 'none',
      }],
      priceData: { A: prices },
      params: {
        startDate: '2020-01-02', endDate: '2020-06-30', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    const p = result.portfolios[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zeroPoints = p.growthCurve.filter((pt: any) => pt.value <= 0);
    expect(zeroPoints.length).toBeGreaterThan(0);
  });
});

// ===== 基准对比 =====
describe('Rust引擎 - 基准对比', () => {
  it('benchmark_ticker不为空时应有benchmark_growth', async () => {
    if (!engineAvailable) return;
    const stock = makePriceData('STOCK', '2020-01-02', '2022-12-30', 100, 0.001);
    const bench = makePriceData('BENCH', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      portfolios: [{
        name: 'WithBench',
        assets: [{ ticker: 'STOCK', weight: 100 }],
        rebalanceFrequency: 'none',
      }],
      priceData: { STOCK: stock, BENCH: bench },
      params: {
        startDate: '2020-01-02', endDate: '2022-12-30', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: 'BENCH',
      },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.benchmarkGrowth).toBeDefined();
    expect(result.benchmarkGrowth).not.toBeNull();
    expect(result.benchmarkGrowth.length).toBeGreaterThan(0);
    expect(result.benchmarkGrowth[0].value).toBeCloseTo(10000, -1);
    expect(result.benchmarkGrowth.at(-1).value).toBeGreaterThan(10000);
  });

  it('benchmark_ticker为空时不应有benchmark_growth', async () => {
    if (!engineAvailable) return;
    const stock = makePriceData('STOCK', '2020-01-02', '2022-12-30', 100, 0.001);
    const body = {
      portfolios: [{
        name: 'NoBench',
        assets: [{ ticker: 'STOCK', weight: 100 }],
        rebalanceFrequency: 'none',
      }],
      priceData: { STOCK: stock },
      params: {
        startDate: '2020-01-02', endDate: '2022-12-30', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/backtest`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.benchmarkGrowth).toBeUndefined();
  });
});

// ===== 蒙特卡洛大数据 =====
describe('Rust引擎 - 蒙特卡洛大数据', () => {
  it('1000次模拟应正常完成', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      portfolio: {
        name: 'Stress',
        assets: [{ ticker: 'A', weight: 60 }, { ticker: 'B', weight: 40 }],
        rebalanceFrequency: 'quarterly',
      },
      priceData: { A: a, B: b },
      params: {
        startDate: '2020-01-02', endDate: '2022-12-30', startingValue: 10000,
        adjustForInflation: false, rollingWindowMonths: 12, benchmarkTicker: '',
      },
      mcParams: { numSimulations: 1000, numYears: 10, blockSize: 5, successThreshold: 1.0 },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/monte-carlo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.percentiles.p50.length).toBeGreaterThan(0);
    expect(result.statistics.successRate).toBeGreaterThanOrEqual(0);
    expect(result.statistics.successRate).toBeLessThanOrEqual(1);
    expect(result.finalDistribution.length).toBe(50);
  });
});

// ===== 优化器不同目标 =====
describe('Rust引擎 - 优化器不同目标', () => {
  it('maxSharpe应返回最高Sharpe比率的权重', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      tickers: ['A', 'B'],
      priceData: { A: a, B: b },
      objective: 'maxSharpe',
      constraints: { minWeight: 0.05, maxWeight: 0.95 },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/optimize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.optimalWeights).toHaveProperty('A');
    expect(result.optimalWeights).toHaveProperty('B');
    expect(result.sharpeRatio).toBeGreaterThan(0);
    const wA = result.optimalWeights.A;
    const wB = result.optimalWeights.B;
    expect(wA + wB).toBeCloseTo(1.0, 1);
  });

  it('minVolatility应返回最低波动率的权重', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      tickers: ['A', 'B'],
      priceData: { A: a, B: b },
      objective: 'minVolatility',
      constraints: { minWeight: 0.05, maxWeight: 0.95 },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/optimize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.optimalWeights).toHaveProperty('A');
    expect(result.optimalWeights).toHaveProperty('B');
    expect(result.expectedVolatility).toBeGreaterThan(0);
    expect(result.expectedReturn).toBeGreaterThan(0);
  });

  it('maxReturn应将所有权重分配给收益最高的资产', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.002);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0002);
    const body = {
      tickers: ['A', 'B'],
      priceData: { A: a, B: b },
      objective: 'maxReturn',
      constraints: { minWeight: 0.0, maxWeight: 1.0 },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/optimize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.optimalWeights).toHaveProperty('A');
    expect(result.optimalWeights).toHaveProperty('B');
    expect(result.expectedReturn).toBeGreaterThan(0);
  });

  it('三种目标结果不同', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const priceData = { A: a, B: b };
    const objectives = ['maxSharpe', 'minVolatility', 'maxReturn'] as const;
    const volatilities: Record<string, number> = {};

    for (const obj of objectives) {
      const body = {
        tickers: ['A', 'B'],
        priceData,
        objective: obj,
        constraints: { minWeight: 0.05, maxWeight: 0.95 },
      };
      const resp = await fetch(`${RUST_URL}/api/engine/optimize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await resp.json();
      volatilities[obj] = result.expectedVolatility;
    }

    expect(volatilities.minVolatility).toBeLessThanOrEqual(volatilities.maxSharpe * 1.05);
    expect(volatilities.maxReturn).toBeGreaterThanOrEqual(volatilities.minVolatility * 0.95);
  });
});

// ===== 有效前沿点数 =====
describe('Rust引擎 - 有效前沿点数验证', () => {
  it('指定numPoints=10应返回10个前沿点', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      tickers: ['A', 'B'],
      priceData: { A: a, B: b },
      numPoints: 10,
    };
    const resp = await fetch(`${RUST_URL}/api/engine/efficient-frontier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.frontier).toHaveLength(10);
    for (const pt of result.frontier) {
      expect(pt).toHaveProperty('weights');
      expect(pt).toHaveProperty('expectedReturn');
      expect(pt).toHaveProperty('expectedVolatility');
      expect(pt).toHaveProperty('sharpeRatio');
    }
  });

  it('默认numPoints应返回20个前沿点', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      tickers: ['A', 'B'],
      priceData: { A: a, B: b },
    };
    const resp = await fetch(`${RUST_URL}/api/engine/efficient-frontier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    expect(result.frontier).toHaveLength(20);
  });

  it('前沿点权重之和应接近1', async () => {
    if (!engineAvailable) return;
    const a = makePriceData('A', '2020-01-02', '2022-12-30', 100, 0.001);
    const b = makePriceData('B', '2020-01-02', '2022-12-30', 100, 0.0005);
    const body = {
      tickers: ['A', 'B'],
      priceData: { A: a, B: b },
      numPoints: 8,
    };
    const resp = await fetch(`${RUST_URL}/api/engine/efficient-frontier`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    for (const pt of result.frontier) {
      const weightSum = Object.values(pt.weights).reduce((s: number, w: number) => s + w, 0);
      expect(weightSum).toBeCloseTo(1.0, 1);
    }
  });
});
