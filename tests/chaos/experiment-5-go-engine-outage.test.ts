/**
 * Chaos Experiment 5: Go 引擎中断
 *
 * SRE：验证 Go 引擎不可用时的 fail-closed 降级行为（ADR-008）。
 * Go 是唯一回测计算引擎（ADR-003），故障应 fail-closed 而非静默降级。
 */
import { describe, it, expect } from 'vitest';
import { CONTAINERS, withContainerStopped, setupChaosLifecycle } from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:15001';
const READY_URL = `${API_URL}/api/ready`;
const BACKTEST_URL = `${API_URL}/api/v1/backtest/portfolio`;

const fixture = setupChaosLifecycle(CONTAINERS.engineGo);

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

async function withEngineStopped(fn: () => Promise<void>) {
  if (!fixture.containerRunning) return;
  await withContainerStopped(
    CONTAINERS.engineGo,
    async () => {
      await new Promise((r) => setTimeout(r, 2000));
      await fn();
    },
    { readyUrl: READY_URL },
  );
}

describe('Chaos Experiment 5: Go 引擎中断', () => {
  it.skipIf(!fixture.containerReady)('引擎停止后 /api/ready 应报告 go=false', async () => {
    await withEngineStopped(async () => {
      const json = await (await fetch(READY_URL)).json();
      expect(json.data?.engine?.go).toBe(false);
    });
  });

  it.skipIf(!fixture.containerReady)('回测端点应返回 503（fail-closed）', async () => {
    await withEngineStopped(async () => {
      const res = await fetch(BACKTEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(MINIMAL_BACKTEST_BODY),
      });
      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBeTruthy();
    });
  });

  it.skipIf(!fixture.containerReady)(
    '响应不应包含 degraded 字段（ADR-008 fail-closed）',
    async () => {
      await withEngineStopped(async () => {
        const res = await fetch(BACKTEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(MINIMAL_BACKTEST_BODY),
        });
        const json = await res.json();
        expect(json.degraded).toBeUndefined();
      });
    },
  );
});
