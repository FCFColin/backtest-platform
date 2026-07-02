/**
 * Chaos Experiment 3: High Concurrency + Graceful Shutdown（vitest 集成测试）
 *
 * SRE: 验证优雅关闭期间在途请求的完成情况
 * 企业为何需要：K8s 滚动更新时发送 SIGTERM 后等待 terminationGracePeriodSeconds，
 * 在途请求丢失意味着用户看到错误，影响可用性 SLO。本测试验证优雅关闭可靠性。
 *
 * 权衡：实验需要发送 SIGTERM，但验证优雅关闭的可靠性至关重要。
 *
 * 重构说明（Task 6.4）：
 * - 原 experiment-3-concurrent-restart.ts 使用 PowerShell Get-Process 查找 Node.js PID，
 *   仅 Windows 可用且可能误杀其他 Node 进程。
 * - 本测试使用 docker kill --signal=SIGTERM 跨平台发送信号到 API 容器。
 * - 测试真实业务端点 /api/v1/data/history，而非仅 /api/health。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  CONTAINERS,
  isDockerAvailable,
  isContainerRunning,
  sendSignalToContainer,
  startContainer,
  waitForHealthy,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:5001';
const HEALTH_URL = `${API_URL}/api/health`;
const CONCURRENT_REQUESTS = 100;

/**
 * 业务端点：/api/v1/data/history
 *
 * 企业理由：原脚本仅测试 /api/health（不涉及 DB/外部服务），
 * 无法验证真实业务路径的优雅关闭。本测试使用 /api/v1/data/history，
 * 该端点涉及 Go 数据服务调用 + DB 查询 + JSON 降级，能真实反映业务请求生命周期。
 */
const BUSINESS_ENDPOINT = `${API_URL}/api/v1/data/history?tickers=SPY&startDate=2020-01-01&endDate=2024-12-31`;

let dockerAvailable = false;
let apiRunning = false;

beforeAll(async () => {
  dockerAvailable = await isDockerAvailable();
  if (dockerAvailable) {
    apiRunning = await isContainerRunning(CONTAINERS.api);
  }
}, 30000);

afterAll(async () => {
  // 确保测试结束后恢复 API 容器
  if (dockerAvailable && apiRunning) {
    try {
      await startContainer(CONTAINERS.api);
      await waitForHealthy(HEALTH_URL, 30000);
    } catch {
      // 容器可能已启动，忽略错误
    }
  }
}, 60000);

describe('Chaos Experiment 3: High Concurrency + Graceful Shutdown', () => {
  it.skipIf(!dockerAvailable)(
    '应在 SIGTERM 期间完成 >95% 的在途请求',
    async () => {
      // 前置条件：API 容器必须运行
      if (!apiRunning) {
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
