import { describe, it, expect } from 'vitest';
import {
  CONTAINERS,
  withContainerStopped,
  getCircuitBreakerState,
  waitForHealthy,
  setupChaosLifecycle,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:15001';
const HEALTH_URL = `${API_URL}/api/health`;
const METRICS_URL = `${API_URL}/api/metrics`;

const DATA_ENDPOINT = `${API_URL}/api/v1/data/meta`;

const fixture = setupChaosLifecycle(CONTAINERS.dataFetcher);

describe('Chaos Experiment 2: External Service Unreachable', () => {
  it.skipIf(!fixture.containerReady)(
    '应在 data-fetcher 不可达时降级到本地数据，且熔断器 Open',
    async () => {
      const steadyHealthy = await waitForHealthy(HEALTH_URL, 10000);
      expect(steadyHealthy).toBe(true);

      await withContainerStopped(
        CONTAINERS.dataFetcher,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const results: { status: number; degraded: boolean }[] = [];
          for (let i = 0; i < 10; i++) {
            try {
              const res = await fetch(DATA_ENDPOINT);
              const json = (await res.json().catch(() => ({}))) as { degraded?: boolean };
              results.push({ status: res.status, degraded: !!json.degraded });
            } catch {
              results.push({ status: 0, degraded: false });
            }
          }

          const has500 = results.some((r) => r.status === 500);
          expect(has500, `出现 500 内部错误: ${results.map((r) => r.status)}`).toBe(false);

          // 断言：至少部分请求应降级到本地数据（degraded 标记）
          const degradedCount = results.filter((r) => r.degraded).length;
          expect(degradedCount, '应有请求降级到本地数据').toBeGreaterThan(0);

          // 断言：go_data_service 熔断器应进入 Open 或 halfOpen 状态
          const breakerState = await getCircuitBreakerState('go_data_service', METRICS_URL);
          expect(
            breakerState,
            `go_data_service 熔断器状态异常: ${breakerState}`,
          ).toBeGreaterThanOrEqual(1);
        },
        { settleMs: 0 },
      );

      const recoveredHealthy = await waitForHealthy(HEALTH_URL, 30000);
      expect(recoveredHealthy).toBe(true);
    },
    90000,
  ); // 90s 超时：包含容器停止/启动 + 熔断器恢复周期
});
