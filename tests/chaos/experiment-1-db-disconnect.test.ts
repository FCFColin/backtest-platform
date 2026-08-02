import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  CONTAINERS,
  disconnectContainer,
  reconnectContainer,
  getCircuitBreakerState,
  waitForHealthy,
  setupChaosFixture,
  type ChaosFixture,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:15001';
const HEALTH_URL = `${API_URL}/api/health`;
const METRICS_URL = `${API_URL}/api/metrics`;

const DB_ENDPOINT = `${API_URL}/api/v1/data/history?tickers=SPY&startDate=2020-01-01&endDate=2024-12-31`;

let fixture: ChaosFixture = {
  dockerAvailable: false,
  containerRunning: false,
  recover: async () => {},
};

beforeAll(async () => {
  fixture = await setupChaosFixture(CONTAINERS.postgres, reconnectContainer);
}, 30000);

afterAll(async () => {
  await fixture.recover();
}, 30000);

describe('Chaos Experiment 1: Database Disconnect', () => {
  it.skipIf(!fixture.dockerAvailable)(
    '应在 PostgreSQL 网络分区期间降级而非 500，且熔断器 Open',
    async () => {
      if (!fixture.containerRunning) {
        // eslint-disable-next-line no-console -- 混沌实验跳过说明需输出到终端
        console.warn('skip: backtest-postgres 容器未运行');
        return;
      }

      const steadyHealthy = await waitForHealthy(HEALTH_URL, 10000);
      expect(steadyHealthy).toBe(true);

      await disconnectContainer(CONTAINERS.postgres);

      try {
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const statusCodes: number[] = [];
        for (let i = 0; i < 10; i++) {
          try {
            const res = await fetch(DB_ENDPOINT);
            statusCodes.push(res.status);
          } catch {
            statusCodes.push(0); // 连接错误
          }
        }

        const has500 = statusCodes.includes(500);
        expect(has500, `出现 500 内部错误，状态码: ${statusCodes}`).toBe(false);

        // 断言：熔断器应进入 Open 状态（1）
        // 注意：熔断器需 volumeThreshold（默认 5 次请求）后才计算错误率，
        const breakerState = await getCircuitBreakerState('postgres', METRICS_URL);
        expect(breakerState, `postgres 熔断器状态异常: ${breakerState}`).toBeGreaterThanOrEqual(1);
      } finally {
        await reconnectContainer(CONTAINERS.postgres);
      }

      // Step 5: 验证恢复——等待熔断器 halfOpen 探测成功后回到 closed
      await new Promise((resolve) => setTimeout(resolve, 15000));

      const recoveredHealthy = await waitForHealthy(HEALTH_URL, 15000);
      expect(recoveredHealthy).toBe(true);

      const recoveryRes = await fetch(DB_ENDPOINT);
      expect(recoveryRes.ok).toBe(true);
    },
    60000,
  ); // 60s 超时：包含网络断开/恢复 + 熔断器恢复周期
});
