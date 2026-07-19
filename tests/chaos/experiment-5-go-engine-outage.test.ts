/**
 * Chaos Experiment 5: Go 引擎中断
 *
 * SRE：验证 Go 引擎不可用时的 fail-closed 降级行为（ADR-031）。
 * 企业为何需要：Go 是唯一回测计算引擎（ADR-008），它的故障不应静默降级到
 * Node 近似计算，而应 fail-closed 告知调用方。本实验验证该契约。
 *
 * 假设（steady-state hypothesis）：
 * - 稳态：/api/ready 返回 200，dependencies.engine.go = true。
 * - Go 引擎停止后：
 *   1) /api/ready 仍可响应，engine.go = false；
 *   2) 回测端点返回 503 + Retry-After 头（fail-closed）；
 *   3) 响应体包含 degraded: true。
 * - 恢复后：engine.go 回到 true。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  CONTAINERS,
  withContainerStopped,
  setupChaosFixture,
  type ChaosFixture,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:5001';
const READY_URL = `${API_URL}/api/ready`;
const BACKTEST_URL = `${API_URL}/api/v1/backtest/portfolio`;

// top-level 初始值 false，与原模式行为一致：skipIf 在注册时求值
let fixture: ChaosFixture = {
  dockerAvailable: false,
  containerRunning: false,
  recover: async () => {},
};

const MINIMAL_BACKTEST_BODY = {
  portfolios: [
    {
      name: 'test',
      assets: [{ ticker: 'SPY', weight: 100 }],
      rebalanceFrequency: 'monthly',
    },
  ],
  startDate: '2023-01-02',
  endDate: '2023-06-30',
  startingValue: 10000,
};

beforeAll(async () => {
  fixture = await setupChaosFixture(CONTAINERS.engineGo);
}, 30000);

afterAll(async () => {
  await fixture.recover();
}, 30000);

describe('Chaos Experiment 5: Go 引擎中断', () => {
  it.skipIf(!fixture.dockerAvailable)('引擎停止后 /api/ready 应报告 go=false', async () => {
    if (!fixture.containerRunning) {
      console.warn('skip: backtest-engine-go 容器未运行');
      return;
    }

    await withContainerStopped(
      CONTAINERS.engineGo,
      async () => {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(READY_URL);
        const json = await res.json();
        expect(json.data?.engine?.go).toBe(false);
      },
      { readyUrl: READY_URL },
    );
  });

  it.skipIf(!fixture.dockerAvailable)('回测端点应返回 503（fail-closed）', async () => {
    if (!fixture.containerRunning) {
      console.warn('skip: backtest-engine-go 容器未运行');
      return;
    }

    await withContainerStopped(
      CONTAINERS.engineGo,
      async () => {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(BACKTEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(MINIMAL_BACKTEST_BODY),
        });
        expect(res.status).toBe(503);
        expect(res.headers.get('Retry-After')).toBeTruthy();
      },
      { readyUrl: READY_URL },
    );
  });

  it.skipIf(!fixture.dockerAvailable)('响应应包含 degraded 标记', async () => {
    if (!fixture.containerRunning) {
      console.warn('skip: backtest-engine-go 容器未运行');
      return;
    }

    await withContainerStopped(
      CONTAINERS.engineGo,
      async () => {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(BACKTEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(MINIMAL_BACKTEST_BODY),
        });
        const json = await res.json();
        expect(json.degraded).toBe(true);
      },
      { readyUrl: READY_URL },
    );
  });
});
