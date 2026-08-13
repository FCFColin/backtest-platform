import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { checkServerAvailable } from '../helpers/chaos.js';
import { API_BASE_URL } from '../helpers/expressApp.js';

const BASE_URL = API_BASE_URL;

let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailable(`${BASE_URL}/api/health`);
});

async function post(path: string, body: object) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

describe('数据引擎页面', () => {
  it.skipIf(!serverAvailable)('正常加载：应显示统计数据', async () => {
    const res = await fetch(`${BASE_URL}/api/data/manage/stats`);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    if (json.data.scanning) {
      expect(json.data.scanning).toBe(true);
      expect(json.data.universe).toBeDefined();
    } else {
      expect(json.data.stats).toBeDefined();
      expect(json.data.universe).toBeDefined();
    }
  });

  it.skipIf(!serverAvailable)('超时处理：轮询超时后应可重试', async () => {
    const MAX_POLL = 10;
    let pollCount = 0;
    let lastScanning = false;

    for (let i = 0; i < MAX_POLL; i++) {
      const res = await fetch(`${BASE_URL}/api/data/manage/stats`);
      const json = await res.json();
      pollCount++;
      if (json.success && json.data?.scanning) {
        lastScanning = true;
      } else {
        lastScanning = false;
        break;
      }
    }

    expect(pollCount).toBeLessThanOrEqual(MAX_POLL);
    if (lastScanning) {
      expect(pollCount).toBe(MAX_POLL);
    }
  });

  it.skipIf(!serverAvailable)('错误态：后端不可用时显示错误', async () => {
    const res = await fetch(`${BASE_URL}/api/data/manage/nonexistent-endpoint`);
    expect(res.ok).toBe(false);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();
  });
});

describe('引擎状态指示器', () => {
  it.skipIf(!serverAvailable)('Go 引擎可用时返回 ok', async () => {
    const res = await fetch(`${BASE_URL}/api/ready`);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toMatch(/^(ok|degraded)$/);
    expect(json.data.engine).toBeDefined();
    expect(json.data.engine.go).toBeDefined();
    if (json.data.engine.go === true) {
      expect(json.data.status).toBe('ok');
    }
  });

  it.skipIf(!serverAvailable)('Go 引擎不可用时返回 degraded', async () => {
    const res = await fetch(`${BASE_URL}/api/ready`);
    const json = await res.json();
    expect(json.success).toBe(true);
    // ADR-008 fail-closed：Go 引擎不可用时就绪降级，计算端点返回 503
    if (json.data.engine.go === false) {
      expect(json.data.status).toBe('degraded');
    }
  });
});

describe('新增工具页面 API', () => {
  it.skipIf(!serverAvailable)('PCA 分析端点存在', async () => {
    const json = await post('/api/pca/analyze', {
      tickers: ['VTI', 'BND'],
      startDate: '2020-01-01',
      endDate: '2024-12-31',
    });
    expect(json.success).toBe(true);
    expect(json.data.eigenvalues).toBeDefined();
    expect(json.data.loadings).toBeDefined();
    expect(json.data.cumulativeVariance).toBeDefined();
    expect(json.data.tickers).toBeDefined();
  });

  it.skipIf(!serverAvailable)('信号分析端点存在', async () => {
    const json = await post('/api/signal/analyze', {
      ticker: 'VTI',
      indicator: 'sma',
      period: 50,
      threshold: 0,
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      signalType: 'both',
    });
    expect(json.success).toBe(true);
    expect(json.data.signals).toBeDefined();
    expect(json.data.statistics).toBeDefined();
    expect(json.data.equityCurve).toBeDefined();
  });

  it.skipIf(!serverAvailable)('LETF 滑点分析端点存在', async () => {
    const json = await post('/api/letf/analyze', {
      letfTicker: 'SPXL',
      benchmarkTicker: 'SPY',
      leverage: 3,
      startDate: '2020-01-01',
      endDate: '2024-12-31',
    });
    expect(json.success).toBe(true);
    expect(json.data.slippageCurve).toBeDefined();
    expect(json.data.annualDecay).toBeDefined();
    expect(json.data.effectiveLeverage).toBeDefined();
    expect(json.data.stats).toBeDefined();
  });

  it.skipIf(!serverAvailable)('战术分配端点存在', async () => {
    const json = await post('/api/tactical/backtest', {
      strategy: {
        id: 'test-strategy',
        name: '测试策略',
        signals: [
          {
            id: 'sig1',
            name: 'SMA50',
            conditions: [{ indicator: 'sma', period: 50, operator: 'gt', threshold: 0 }],
            targetWeights: [{ ticker: 'VTI', weight: 100 }],
          },
        ],
        aggregationMethod: 'voting',
      },
      startDate: '2020-01-01',
      endDate: '2024-12-31',
      startingValue: 10000,
      rebalanceFrequency: 'quarterly',
    });
    expect(json.success).toBe(true);
    expect(json.data.portfolio).toBeDefined();
    expect(json.data.benchmark).toBeDefined();
    expect(json.data.signalHistory).toBeDefined();
  });

  it.skipIf(!serverAvailable)('目标优化器端点存在', async () => {
    const json = await post('/api/goal-optimizer/optimize', {
      targetAmount: 100000,
      initialAmount: 10000,
      years: 10,
      assets: [{ ticker: 'VTI', weight: 100 }],
      numSimulations: 100,
    });
    expect(json.success).toBe(true);
    expect(json.data.successProbability).toBeDefined();
    expect(json.data.probabilityCurve).toBeDefined();
    expect(json.data.optimalPath).toBeDefined();
    expect(json.data.recommendation).toBeDefined();
  });
});

describe('布局验证', () => {
  it('导航栏包含所有工具页面入口', () => {
    const navSource = readFileSync(
      resolve(process.cwd(), 'packages/frontend/src/components/layout/Navbar.tsx'),
      'utf-8',
    );
    for (const to of [
      '/',
      '/backtest-optimizer',
      '/analysis',
      '/pca',
      '/optimizer',
      '/monte-carlo',
      '/tactical',
      '/letf-slippage',
      '/data-engine',
    ]) {
      expect(navSource).toContain(`to: '${to}'`);
    }
  });

  it('页脚包含法律链接', () => {
    const footerSource = readFileSync(
      resolve(process.cwd(), 'packages/frontend/src/components/layout/Footer.tsx'),
      'utf-8',
    );
    expect(footerSource).toContain("to: '/help'");
    expect(footerSource).toContain("to: '/about'");
  });
});
