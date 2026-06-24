/**
 * Rust ↔ JS 引擎一致性测试
 *
 * 验证同一输入在 Rust HTTP 引擎和 Node.js 引擎上的输出差异 < 0.01%。
 *
 * 前提：Rust 引擎需要在 http://127.0.0.1:5002 运行。
 * 启动方式：cd engine-rs && cargo run --release
 * 若 Rust 引擎未运行，测试自动跳过。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { runPortfolioBacktest } from '../../api/engine/portfolio.js';
import type { Portfolio, BacktestParameters } from '../../shared/types.js';

const RUST_ENGINE_URL = process.env.RUST_ENGINE_URL || 'http://127.0.0.1:5002';
let rustAvailable = false;

/** 生成确定性测试价格数据（固定日收益率） */
function makePriceData(
  ticker: string,
  startDate: string,
  endDate: string,
  startPrice: number,
  dailyReturn: number,
): Record<string, number> {
  const prices: Record<string, number> = {};
  const current = new Date(startDate);
  const end = new Date(endDate);
  let price = startPrice;
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      prices[current.toISOString().slice(0, 10)] = Math.round(price * 1000) / 1000;
      price *= 1 + dailyReturn;
    }
    current.setDate(current.getDate() + 1);
  }
  return prices;
}

beforeAll(async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`${RUST_ENGINE_URL}/api/engine/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (resp.ok) rustAvailable = true;
  } catch {
    // Rust 引擎未运行，测试将跳过
  }
});

/** 计算相对差异百分比 */
function relativeDiff(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const denominator = Math.abs(a) > Math.abs(b) ? Math.abs(a) : Math.abs(b);
  if (denominator === 0) return Math.abs(a - b);
  return Math.abs(a - b) / denominator;
}

/** 对比核心统计指标 */
function assertMetricsClose(
  rustStats: Record<string, number>,
  nodeStats: Record<string, number>,
  metrics: string[],
  threshold = 0.0001, // 0.01%
) {
  for (const metric of metrics) {
    const rustVal = rustStats[metric];
    const nodeVal = nodeStats[metric];
    if (rustVal !== undefined && nodeVal !== undefined) {
      const diff = relativeDiff(rustVal, nodeVal);
      expect(diff).toBeLessThan(threshold);
    }
  }
}

describe('Rust ↔ JS 引擎一致性测试', () => {
  it('基础回测：60/40 SPY/BND 10年回测', async () => {
    if (!rustAvailable) return;

    // 生成 10 年测试数据（2014-01-02 ~ 2023-12-29）
    const spy = makePriceData('SPY', '2014-01-02', '2023-12-29', 180, 0.0004);
    const bnd = makePriceData('BND', '2014-01-02', '2023-12-29', 80, 0.0001);

    const portfolios: Portfolio[] = [
      {
        id: 'p1',
        name: '60/40',
        assets: [
          { ticker: 'SPY', weight: 60 },
          { ticker: 'BND', weight: 40 },
        ],
        rebalanceFrequency: 'quarterly',
      },
    ];

    const params: BacktestParameters = {
      startDate: '2014-01-02',
      endDate: '2023-12-29',
      startingValue: 10000,
      adjustForInflation: false,
      rollingWindowMonths: 12,
      benchmarkTicker: 'SPY',
    };

    const priceData = { SPY: spy, BND: bnd };

    // 1. 调用 Rust 引擎
    const rustBody = {
      portfolios: portfolios.map((p) => ({
        name: p.name,
        assets: p.assets,
        rebalanceFrequency: p.rebalanceFrequency,
      })),
      priceData,
      params: {
        startDate: params.startDate,
        endDate: params.endDate,
        startingValue: params.startingValue,
        adjustForInflation: params.adjustForInflation,
        rollingWindowMonths: params.rollingWindowMonths,
        benchmarkTicker: params.benchmarkTicker,
      },
    };

    const rustResp = await fetch(`${RUST_ENGINE_URL}/api/engine/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rustBody),
    });
    const rustResult = await rustResp.json();

    // 2. 调用 Node.js 引擎
    const nodeResult = runPortfolioBacktest(portfolios, priceData, params);

    // 3. 对比核心指标
    expect(rustResult.portfolios).toHaveLength(1);
    expect(nodeResult.portfolios).toHaveLength(1);

    const rustP = rustResult.portfolios[0];
    const nodeP = nodeResult.portfolios[0];

    // 增长曲线长度应一致
    expect(rustP.growthCurve.length).toBe(nodeP.growthCurve.length);

    // 核心统计指标差异 < 0.01%
    assertMetricsClose(rustP.statistics, nodeP.statistics, [
      'cagr',
      'maxDrawdown',
      'sharpe',
      'volatility',
      'sortino',
    ]);

    // 增长曲线最终值差异 < 0.01%
    const rustFinalValue = rustP.growthCurve[rustP.growthCurve.length - 1].value;
    const nodeFinalValue = nodeP.growthCurve[nodeP.growthCurve.length - 1].value;
    expect(relativeDiff(rustFinalValue, nodeFinalValue)).toBeLessThan(0.0001);
  });

  it('含现金流回测一致性', async () => {
    if (!rustAvailable) return;

    const spy = makePriceData('SPY', '2014-01-02', '2023-12-29', 180, 0.0004);
    const bnd = makePriceData('BND', '2014-01-02', '2023-12-29', 80, 0.0001);

    const portfolios: Portfolio[] = [
      {
        id: 'p1',
        name: '60/40 with cashflows',
        assets: [
          { ticker: 'SPY', weight: 60 },
          { ticker: 'BND', weight: 40 },
        ],
        rebalanceFrequency: 'monthly',
      },
    ];

    const params: BacktestParameters = {
      startDate: '2014-01-02',
      endDate: '2023-12-29',
      startingValue: 10000,
      adjustForInflation: false,
      rollingWindowMonths: 12,
      benchmarkTicker: '',
      cashflowLegs: [
        {
          id: 'cf1',
          amount: 1000,
          type: 'contribution',
          frequency: 'yearly',
          offset: 0,
        },
      ],
    };

    const priceData = { SPY: spy, BND: bnd };

    // 1. 调用 Rust 引擎
    const rustBody = {
      portfolios: portfolios.map((p) => ({
        name: p.name,
        assets: p.assets,
        rebalanceFrequency: p.rebalanceFrequency,
      })),
      priceData,
      params: {
        startDate: params.startDate,
        endDate: params.endDate,
        startingValue: params.startingValue,
        adjustForInflation: params.adjustForInflation,
        rollingWindowMonths: params.rollingWindowMonths,
        benchmarkTicker: params.benchmarkTicker,
        cashflowLegs: params.cashflowLegs,
      },
    };

    const rustResp = await fetch(`${RUST_ENGINE_URL}/api/engine/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rustBody),
    });
    const rustResult = await rustResp.json();

    // 2. 调用 Node.js 引擎
    const nodeResult = runPortfolioBacktest(portfolios, priceData, params);

    // 3. 对比
    const rustP = rustResult.portfolios[0];
    const nodeP = nodeResult.portfolios[0];

    // 增长曲线长度应一致
    expect(rustP.growthCurve.length).toBe(nodeP.growthCurve.length);

    // 核心统计指标差异 < 0.01%
    assertMetricsClose(rustP.statistics, nodeP.statistics, [
      'cagr',
      'maxDrawdown',
      'volatility',
    ]);

    // 增长曲线最终值差异 < 0.01%
    const rustFinalValue = rustP.growthCurve[rustP.growthCurve.length - 1].value;
    const nodeFinalValue = nodeP.growthCurve[nodeP.growthCurve.length - 1].value;
    expect(relativeDiff(rustFinalValue, nodeFinalValue)).toBeLessThan(0.0001);
  });
});
