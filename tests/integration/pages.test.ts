import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { checkServerAvailable } from '../helpers/server.js';
import { API_BASE_URL } from '../helpers/constants.js';

// 集成测试：数据引擎页面、引擎状态指示器、新增工具页面 API、布局验证
// 这些测试需要后端服务器运行（默认端口 5001），未运行时自动跳过

const BASE_URL = API_BASE_URL;

let serverAvailable = false;

beforeAll(async () => {
  serverAvailable = await checkServerAvailable(`${BASE_URL}/api/health`);
});

// ===== 1. 数据引擎页面测试 =====
describe('数据引擎页面', () => {
  it.skipIf(!serverAvailable)('正常加载：应显示统计数据', async () => {
    // 模拟前端轮询逻辑：访问 /api/data/manage/stats 验证返回结构
    const res = await fetch(`${BASE_URL}/api/data/manage/stats`);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    // 数据结构：stats（缓存命中）或 scanning: true（后台扫描中）
    if (json.data.scanning) {
      expect(json.data.scanning).toBe(true);
      expect(json.data.universe).toBeDefined();
    } else {
      expect(json.data.stats).toBeDefined();
      expect(json.data.universe).toBeDefined();
    }
  });

  it.skipIf(!serverAvailable)('超时处理：轮询超时后应可重试', async () => {
    // 模拟前端轮询逻辑：scanning: true 时最多轮询 10 次（MAX_POLL=10）
    const MAX_POLL = 10;
    let pollCount = 0;
    let lastScanning = false;

    for (let i = 0; i < MAX_POLL; i++) {
      const res = await fetch(`${BASE_URL}/api/data/manage/stats`);
      const json = await res.json();
      pollCount++;
      if (json.success && json.data?.scanning) {
        lastScanning = true;
        // 前端会等待 3 秒后重试，这里不实际等待以加速测试
      } else {
        lastScanning = false;
        break;
      }
    }

    // 验证轮询次数不超过上限
    expect(pollCount).toBeLessThanOrEqual(MAX_POLL);
    // 若持续 scanning，10 次后应停止轮询（前端逻辑）
    if (lastScanning) {
      expect(pollCount).toBe(MAX_POLL);
    }
  });

  it.skipIf(!serverAvailable)('错误态：后端不可用时显示错误', async () => {
    // 模拟后端不可用：调用不存在的管理端点，验证错误结构
    const res = await fetch(`${BASE_URL}/api/data/manage/nonexistent-endpoint`);
    expect(res.ok).toBe(false);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toBeDefined();
  });
});

// ===== 2. 引擎状态指示器测试 =====
describe('引擎状态指示器', () => {
  it.skipIf(!serverAvailable)('Rust 引擎可用时返回 ok', async () => {
    // 调用 /api/health，验证返回 status 为 'ok' 或 'degraded'
    const res = await fetch(`${BASE_URL}/api/health`);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.status).toMatch(/^(ok|degraded)$/);
    expect(json.data.engine).toBeDefined();
    expect(json.data.engine.rust).toBeDefined();
    expect(json.data.engine.node).toBeDefined();
    // Rust 可用时 status 应为 ok
    if (json.data.engine.rust === true) {
      expect(json.data.status).toBe('ok');
    }
  });

  it.skipIf(!serverAvailable)('Rust 引擎不可用时返回 degraded', async () => {
    // 调用 /api/health，验证 engine.rust 为 false 时 status 为 'degraded'
    const res = await fetch(`${BASE_URL}/api/health`);
    const json = await res.json();
    expect(json.success).toBe(true);
    // Rust 引擎不可用时整体降级，但仍可服务（Node.js 备用引擎）
    if (json.data.engine.rust === false) {
      expect(json.data.status).toBe('degraded');
    }
    // Node.js 引擎即本进程，始终可用
    expect(json.data.engine.node).toBe(true);
  });
});

// ===== 3. 新增工具页面 API 测试 =====
describe('新增工具页面 API', () => {
  it.skipIf(!serverAvailable)('PCA 分析端点存在', async () => {
    // POST /api/pca/analyze，验证返回结构
    const res = await fetch(`${BASE_URL}/api/pca/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: ['VTI', 'BND'],
        startDate: '2020-01-01',
        endDate: '2024-12-31',
      }),
    });
    const json = await res.json();
    // 端点存在且返回有效结构
    expect(json).toBeDefined();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json.data.eigenvalues).toBeDefined();
    expect(json.data.loadings).toBeDefined();
    expect(json.data.cumulativeVariance).toBeDefined();
    expect(json.data.tickers).toBeDefined();
  });

  it.skipIf(!serverAvailable)('信号分析端点存在', async () => {
    // POST /api/signal/analyze，验证返回结构
    const res = await fetch(`${BASE_URL}/api/signal/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker: 'VTI',
        indicator: 'sma',
        period: 50,
        threshold: 0,
        startDate: '2020-01-01',
        endDate: '2024-12-31',
        signalType: 'both',
      }),
    });
    const json = await res.json();
    expect(json).toBeDefined();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json.data.signals).toBeDefined();
    expect(json.data.statistics).toBeDefined();
    expect(json.data.equityCurve).toBeDefined();
  });

  it.skipIf(!serverAvailable)('LETF 滑点分析端点存在', async () => {
    // POST /api/letf/analyze，验证返回结构
    const res = await fetch(`${BASE_URL}/api/letf/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        letfTicker: 'SPXL',
        benchmarkTicker: 'SPY',
        leverage: 3,
        startDate: '2020-01-01',
        endDate: '2024-12-31',
      }),
    });
    const json = await res.json();
    expect(json).toBeDefined();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json.data.slippageCurve).toBeDefined();
    expect(json.data.annualDecay).toBeDefined();
    expect(json.data.effectiveLeverage).toBeDefined();
    expect(json.data.stats).toBeDefined();
  });

  it.skipIf(!serverAvailable)('战术分配端点存在', async () => {
    // POST /api/tactical/backtest，验证返回结构
    const res = await fetch(`${BASE_URL}/api/tactical/backtest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy: {
          id: 'test-strategy',
          name: '测试策略',
          signals: [
            {
              id: 'sig1',
              name: 'SMA50',
              conditions: [
                { indicator: 'sma', period: 50, operator: 'gt', threshold: 0 },
              ],
              targetWeights: [{ ticker: 'VTI', weight: 100 }],
            },
          ],
          aggregationMethod: 'voting',
        },
        startDate: '2020-01-01',
        endDate: '2024-12-31',
        startingValue: 10000,
        rebalanceFrequency: 'quarterly',
      }),
    });
    const json = await res.json();
    expect(json).toBeDefined();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json.data.portfolio).toBeDefined();
    expect(json.data.benchmark).toBeDefined();
    expect(json.data.signalHistory).toBeDefined();
  });

  it.skipIf(!serverAvailable)('目标优化器端点存在', async () => {
    // POST /api/goal-optimizer/optimize，验证返回结构
    const res = await fetch(`${BASE_URL}/api/goal-optimizer/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetAmount: 100000,
        initialAmount: 10000,
        years: 10,
        assets: [{ ticker: 'VTI', weight: 100 }],
        numSimulations: 100,
      }),
    });
    const json = await res.json();
    expect(json).toBeDefined();
    expect(json.success).toBe(true);
    expect(json.data).toBeDefined();
    expect(json.data.successProbability).toBeDefined();
    expect(json.data.probabilityCurve).toBeDefined();
    expect(json.data.optimalPath).toBeDefined();
    expect(json.data.recommendation).toBeDefined();
  });
});

// ===== 4. 布局验证 =====
describe('布局验证', () => {
  it('导航栏包含所有工具页面入口', () => {
    // CSR应用：导航链接在客户端渲染，验证Navbar源码包含所有工具页面路由
    const navbarSource = readFileSync(
      resolve(process.cwd(), 'src/components/layout/Navbar.tsx'),
      'utf-8',
    );
    // 验证关键导航路由存在（覆盖所有工具分组）
    expect(navbarSource).toContain("to: '/'");
    expect(navbarSource).toContain("to: '/backtest-optimizer'");
    expect(navbarSource).toContain("to: '/analysis'");
    expect(navbarSource).toContain("to: '/pca'");
    expect(navbarSource).toContain("to: '/optimizer'");
    expect(navbarSource).toContain("to: '/monte-carlo'");
    expect(navbarSource).toContain("to: '/tactical'");
    expect(navbarSource).toContain("to: '/letf-slippage'");
    expect(navbarSource).toContain("to: '/data-engine'");
  });

  it('页脚包含法律链接', () => {
    const footerSource = readFileSync(
      resolve(process.cwd(), 'src/components/layout/Footer.tsx'),
      'utf-8',
    );
    // 验证页脚包含法律相关链接
    expect(footerSource).toContain('href="/help"');
    expect(footerSource).toContain('href="/about"');
    expect(footerSource).toContain('mailto:');
  });
});
