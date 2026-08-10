import { describe, it, expect } from 'vitest';
import {
  CONTAINERS,
  sendSignalToContainer,
  startContainer,
  waitForHealthy,
  setupChaosLifecycle,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:15001';
const HEALTH_URL = `${API_URL}/api/health`;
const CONCURRENT_REQUESTS = 100;

const BUSINESS_ENDPOINT = `${API_URL}/api/v1/data/meta`;

const fixture = setupChaosLifecycle(CONTAINERS.api, async (name) => {
  await startContainer(name);
  await waitForHealthy(HEALTH_URL, 30000);
});

describe('Chaos Experiment 3: High Concurrency + Graceful Shutdown', () => {
  it.skipIf(!fixture.containerReady)(
    '应在 SIGTERM 期间完成 >95% 的在途请求',
    async () => {
      const steadyHealthy = await waitForHealthy(HEALTH_URL, 10000);
      expect(steadyHealthy).toBe(true);

      const requestPromises = Array.from({ length: CONCURRENT_REQUESTS }, async () => {
        try {
          const start = Date.now();
          const res = await fetch(BUSINESS_ENDPOINT);
          const duration = Date.now() - start;
          return { ok: res.ok, status: res.status, duration };
        } catch (error) {
          return { ok: false, status: 0, duration: 0, error: String(error) };
        }
      });

      setTimeout(async () => {
        try {
          await sendSignalToContainer(CONTAINERS.api, 'SIGTERM');
        } catch {
          /* container may already be shutting down */
        }
      }, 100);

      const results = await Promise.allSettled(requestPromises);

      let completed = 0;
      let failed = 0;
      let connectionErrors = 0;
      const statusCodes = new Map<number, number>();

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.ok) {
            completed++;
          } else if (result.value.status === 0) {
            connectionErrors++;
            failed++;
          } else {
            failed++;
            statusCodes.set(result.value.status, (statusCodes.get(result.value.status) ?? 0) + 1);
          }
        } else {
          failed++;
          connectionErrors++;
        }
      }

      const completionRate = completed / CONCURRENT_REQUESTS;
      expect(
        completionRate,
        `完成率 ${completionRate * 100}% 低于 95%（completed=${completed}, failed=${failed}, connectionErrors=${connectionErrors}）`,
      ).toBeGreaterThan(0.95);

      await startContainer(CONTAINERS.api);

      const recoveredHealthy = await waitForHealthy(HEALTH_URL, 30000);
      expect(recoveredHealthy).toBe(true);
    },
    120000,
  ); // 120s 超时：包含 100 并发请求 + 优雅关闭 + 容器重启
});
