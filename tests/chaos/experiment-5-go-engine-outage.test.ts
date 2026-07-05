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
  isDockerAvailable,
  isContainerRunning,
  stopContainer,
  startContainer,
  waitForHealthy,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:5001';
const READY_URL = `${API_URL}/api/ready`;
const BACKTEST_URL = `${API_URL}/api/v1/backtest/portfolio`;

let dockerAvailable = false;
let engineRunning = false;

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
  dockerAvailable = await isDockerAvailable();
  if (dockerAvailable) {
    engineRunning = await isContainerRunning(CONTAINERS.engineGo);
  }
}, 30000);

afterAll(async () => {
  if (dockerAvailable && engineRunning) {
    try {
      await startContainer(CONTAINERS.engineGo);
    } catch {
      // 已启动则忽略
    }
  }
}, 30000);

describe('Chaos Experiment 5: Go 引擎中断', () => {
  it.skipIf(!dockerAvailable)('引擎停止后 /api/ready 应报告 go=false', async () => {
    if (!engineRunning) {
      console.warn('skip: backtest-engine-go 容器未运行');
      return;
    }

    await stopContainer(CONTAINERS.engineGo);
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const res = await fetch(READY_URL);
      const json = await res.json();
      expect(json.data?.engine?.go).toBe(false);
    } finally {
      await startContainer(CONTAINERS.engineGo);
      await waitForHealthy(READY_URL, 30000);
    }
  });

  it.skipIf(!dockerAvailable)('回测端点应返回 503（fail-closed）', async () => {
    if (!engineRunning) {
      console.warn('skip: backtest-engine-go 容器未运行');
      return;
    }

    await stopContainer(CONTAINERS.engineGo);
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const res = await fetch(BACKTEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(MINIMAL_BACKTEST_BODY),
      });
      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBeTruthy();
    } finally {
      await startContainer(CONTAINERS.engineGo);
      await waitForHealthy(READY_URL, 30000);
    }
  });

  it.skipIf(!dockerAvailable)('响应应包含 degraded 标记', async () => {
    if (!engineRunning) {
      console.warn('skip: backtest-engine-go 容器未运行');
      return;
    }

    await stopContainer(CONTAINERS.engineGo);
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const res = await fetch(BACKTEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(MINIMAL_BACKTEST_BODY),
      });
      const json = await res.json();
      expect(json.degraded).toBe(true);
    } finally {
      await startContainer(CONTAINERS.engineGo);
      await waitForHealthy(READY_URL, 30000);
    }
  });
});
