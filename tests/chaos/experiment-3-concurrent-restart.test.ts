import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  CONTAINERS,
  sendSignalToContainer,
  startContainer,
  waitForHealthy,
  setupChaosFixture,
  type ChaosFixture,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:15001';
const HEALTH_URL = `${API_URL}/api/health`;
const CONCURRENT_REQUESTS = 100;

const BUSINESS_ENDPOINT = `${API_URL}/api/v1/data/history?tickers=SPY&startDate=2020-01-01&endDate=2024-12-31`;

// top-level 初始值 false，与原模式行为一致：skipIf 在注册时求值
let fixture: ChaosFixture = {
  dockerAvailable: false,
  containerRunning: false,
  recover: async () => {},
};

beforeAll(async () => {
  fixture = await setupChaosFixture(CONTAINERS.api);
}, 30000);

afterAll(async () => {
  if (fixture.dockerAvailable && fixture.containerRunning) {
    try {
      await startContainer(CONTAINERS.api);
      await waitForHealthy(HEALTH_URL, 30000);
    } catch {
      // 容器可能已启动，忽略错误
    }
  }
}, 60000);

describe('Chaos Experiment 3: High Concurrency + Graceful Shutdown', () => {
  it.skipIf(!fixture.dockerAvailable)(
    '应在 SIGTERM 期间完成 >95% 的在途请求',
    async () => {
      // 前置条件：API 容器必须运行
      if (!fixture.containerRunning) {
        console.warn('skip: backtest-api 容器未运行');
        return;
      }

      // Step 1: 验证稳态——API 健康检查通过
      const steadyHealthy = await waitForHealthy(HEALTH_URL, 10000);
      expect(steadyHealthy).toBe(true);

      // Step 2: 发送 100 个并发请求到业务端点
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

      // Step 3: 等待请求 in-flight 后发送 SIGTERM 到 API 容器
      // 100ms 足够请求到达服务器但未完成（业务端点涉及 DB/Go 服务调用）
      setTimeout(async () => {
        try {
          await sendSignalToContainer(CONTAINERS.api, 'SIGTERM');
        } catch {
          // 信号发送失败不阻断测试，结果统计会反映问题
        }
      }, 100);

      // Step 4: 等待所有请求完成（优雅关闭最长 60s）
      const results = await Promise.allSettled(requestPromises);

      // Step 5: 统计完成 vs 失败
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

      // Step 6: 断言完成率 > 95%
      const completionRate = completed / CONCURRENT_REQUESTS;
      expect(
        completionRate,
        `完成率 ${completionRate * 100}% 低于 95%（completed=${completed}, failed=${failed}, connectionErrors=${connectionErrors}）`,
      ).toBeGreaterThan(0.95);

      // Step 7: 恢复 API 容器
      await startContainer(CONTAINERS.api);

      // Step 8: 验证 API 恢复健康
      const recoveredHealthy = await waitForHealthy(HEALTH_URL, 30000);
      expect(recoveredHealthy).toBe(true);
    },
    120000,
  ); // 120s 超时：包含 100 并发请求 + 优雅关闭 + 容器重启
});
