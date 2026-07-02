/**
 * 引擎一致性测试：Go ↔ Node.js
 *
 * 验证同一输入在 Go HTTP 引擎与 Node.js 参照实现上的输出方向/数量级一致。
 *
 * 引擎职责（ADR-008 / ADR-031）：
 * - Go 引擎（http://127.0.0.1:5004）：唯一主引擎，线上计算的权威来源。
 * - Node.js 引擎（api/engine/）：Node-canonical 功能权威；对回测仅作 parity 参照
 *   （已知发散近似，不用于线上降级，ADR-031 fail-closed）。
 *
 * 历史：Rust 引擎已退役（Go↔Rust parity 验证通过后删除，见 ADR-008）。
 *
 * 前提：Go 引擎需运行（cd engine-go && go run ./cmd/server）。未运行时用例自动跳过。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { runPortfolioBacktest } from '../../api/engine/portfolio.js';
import type { Portfolio, BacktestParameters } from '../../shared/types.js';
import { checkServerAvailable } from '../helpers/server.js';
import { ENGINE_GO_BASE_URL } from '../helpers/constants.js';
import { makePriceData } from '../helpers/fixtures.js';

const GO_ENGINE_URL = ENGINE_GO_BASE_URL;
let goAvailable = false;

beforeAll(async () => {
  goAvailable = await checkServerAvailable(`${GO_ENGINE_URL}/api/engine/health`);
});

/** 计算相对差异百分比 */
function relativeDiff(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const denominator = Math.abs(a) > Math.abs(b) ? Math.abs(a) : Math.abs(b);
  if (denominator === 0) return Math.abs(a - b);
  return Math.abs(a - b) / denominator;
}

/** 构造引擎请求体 */
function buildEngineBody(
  portfolios: Portfolio[],
  priceData: Record<string, Record<string, number>>,
  params: BacktestParameters,
) {
  return {
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
      ...(params.cashflowLegs ? { cashflowLegs: params.cashflowLegs } : {}),
    },
  };
}

/** 调用 Go 引擎回测端点 */
async function callEngineBacktest(
  baseUrl: string,
  body: unknown,
): Promise<{
  portfolios: { growthCurve: { value: number }[]; statistics: Record<string, number> }[];
}> {
  const resp = await fetch(`${baseUrl}/api/engine/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return resp.json();
}

/**
 * 引擎结果与 Node 结果的"宽松"健全性对比。
 *
 * ADR-031：Node 引擎是已知的发散近似（在 drag/CPI/汇率/现金流等高级功能上
 * 精度低于 Go），不再是 0.01% parity 的参照基准。此处只做宽松校验
 * （增长曲线长度一致 + 指标同号、同数量级），用于捕获 Go 引擎的粗大 bug。
 */
function assertEngineSaneVsNode(
  engineP: { growthCurve: { value: number }[]; statistics: Record<string, number> },
  nodeP: { growthCurve: { value: number }[]; statistics: Record<string, number> },
  metrics: string[],
  looseThreshold = 0.25,
) {
  expect(engineP.growthCurve.length).toBe(nodeP.growthCurve.length);
  for (const metric of metrics) {
    const engineVal = engineP.statistics[metric];
    const nodeVal = nodeP.statistics[metric];
    if (!Number.isFinite(engineVal) || !Number.isFinite(nodeVal)) {
      continue;
    }
    expect(Math.sign(engineVal), `metric ${metric} 符号不一致`).toBe(Math.sign(nodeVal));
    expect(relativeDiff(engineVal, nodeVal), `metric ${metric} 偏离过大`).toBeLessThan(
      looseThreshold,
    );
  }
}

describe('引擎一致性测试：Go ↔ Node.js', () => {
  it('基础回测：60/40 SPY/BND 10年回测（Go 对齐 Node）', async () => {
    if (!goAvailable) {
      return;
    }

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
    const body = buildEngineBody(portfolios, priceData, params);
    const nodeResult = runPortfolioBacktest(portfolios, priceData, params);
    const nodeP = nodeResult.portfolios[0];
    const metrics = ['cagr', 'maxDrawdown', 'sharpe', 'volatility', 'sortino'];

    const goResult = await callEngineBacktest(GO_ENGINE_URL, body);
    expect(goResult.portfolios).toHaveLength(1);
    assertEngineSaneVsNode(goResult.portfolios[0], nodeP, metrics);
  });

  it('含现金流回测一致性（Go 对齐 Node）', async () => {
    if (!goAvailable) {
      return;
    }

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
    const body = buildEngineBody(portfolios, priceData, params);
    const nodeResult = runPortfolioBacktest(portfolios, priceData, params);
    const nodeP = nodeResult.portfolios[0];
    const metrics = ['cagr', 'maxDrawdown', 'volatility'];

    const goResult = await callEngineBacktest(GO_ENGINE_URL, body);
    assertEngineSaneVsNode(goResult.portfolios[0], nodeP, metrics, 0.5);
  });
});
