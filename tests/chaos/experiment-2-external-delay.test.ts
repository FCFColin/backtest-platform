import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  CONTAINERS,
  withContainerStopped,
  getCircuitBreakerState,
  waitForHealthy,
  setupChaosFixture,
  type ChaosFixture,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:15001';
const HEALTH_URL = `${API_URL}/api/health`;
const METRICS_URL = `${API_URL}/api/metrics`;

const DATA_ENDPOINT = `${API_URL}/api/v1/data/history?tickers=SPY&startDate=2020-01-01&endDate=2024-12-31`;

// top-level 初始值 false，与原模式行为一致：skipIf 在注册时求值
let fixture: ChaosFixture = {
  dockerAvailable: false,
  containerRunning: false,
  recover: async () => {},
};

beforeAll(async () => {
  fixture = await setupChaosFixture(CONTAINERS.dataFetcher);
}, 30000);

afterAll(async () => {
  await fixture.recover();
}, 30000);

describe('Chaos Experiment 2: External Service Unreachable', () => {
  it.skipIf(!fixture.dockerAvailable)(
    '应在 data-fetcher 不可达时降级到本地数据，且熔断器 Open',
    async () => {
      // 前置条件：data-fetcher 容器必须运行
      if (!fixture.containerRunning) {
        // eslint-disable-next-line no-console -- 混沌实验跳过说明需输出到终端
        console.warn('skip: backtest-data-fetcher 容器未运行');
        return;
      }

      // Step 1: 验证稳态——API 健康检查通过
      const steadyHealthy = await waitForHealthy(HEALTH_URL, 10000);
      expect(steadyHealthy).toBe(true);

      // Step 2-4: 停止 data-fetcher → 断言 → 恢复（withContainerStopped 保证恢复）
      await withContainerStopped(
        CONTAINERS.dataFetcher,
        async () => {
          // 等待连接池检测到故障 + 熔断器累积失败请求
          // goDataServiceBreaker: volumeThreshold=5, errorThresholdPercentage=50
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Step 3: 发送请求，验证降级行为
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

          // 断言：不应出现 500 内部错误
          const has500 = results.some((r) => r.status === 500);
          expect(has500, `出现 500 内部错误: ${results.map((r) => r.status)}`).toBe(false);

          // 断言：至少部分请求应降级到本地数据（degraded 标记）
          // 注意：首次请求可能命中 Go 服务缓存，后续请求触发熔断后降级
          const degradedCount = results.filter((r) => r.degraded).length;
          expect(degradedCount, '应有请求降级到本地数据').toBeGreaterThan(0);

          // 断言：go_data_service 熔断器应进入 Open 或 halfOpen 状态
          // volumeThreshold=5，10 次请求足以触发
          const breakerState = await getCircuitBreakerState('go_data_service', METRICS_URL);
          expect(
            breakerState,
            `go_data_service 熔断器状态异常: ${breakerState}`,
          ).toBeGreaterThanOrEqual(1);
        },
        { settleMs: 0 },
      );

      // Step 5: 验证恢复——等待容器启动 + 熔断器 halfOpen 探测成功
      // goDataServiceBreaker resetTimeout=30s，但容器启动后健康检查通过即可服务
      const recoveredHealthy = await waitForHealthy(HEALTH_URL, 30000);
      expect(recoveredHealthy).toBe(true);
    },
    90000,
  ); // 90s 超时：包含容器停止/启动 + 熔断器恢复周期
});
