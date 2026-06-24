/**
 * Chaos Experiment 1: Database Disconnect（vitest 集成测试）
 *
 * SRE: 验证 PostgreSQL 网络分区时的系统行为
 * 企业为何需要：K8s 滚动更新、网络分区、数据库维护都可能导致连接断开，
 * 熔断器应在故障期间快速失败（Open），恢复后自动回到 Closed。
 *
 * 权衡：实验需要 Docker 环境，无 Docker 时自动 skip。
 *
 * 重构说明（Task 6.2）：
 * - 原 experiment-1-db-disconnect.ts 使用 process.exit 和 console.log，
 *   不与 vitest 集成，且容器名错误（backtest-postgres-1 vs backtest-postgres）。
 * - 本测试使用 it.skipIf 在无 Docker 时跳过，断言熔断器状态和降级行为。
 * - 测试 DB 相关端点 /api/v1/data/history（依赖 pgCircuitBreaker），而非 /api/health。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  CONTAINERS,
  isDockerAvailable,
  isContainerRunning,
  disconnectContainer,
  reconnectContainer,
  getCircuitBreakerState,
  waitForHealthy,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:5001';
const HEALTH_URL = `${API_URL}/api/health`;
const METRICS_URL = `${API_URL}/api/metrics`;

/**
 * DB 相关端点：/api/v1/data/history
 *
 * 该端点优先调用 Go 数据服务，失败后降级到 fetchHistoryData（使用 pgCircuitBreaker 查询 PostgreSQL），
 * DB 不可用时进一步降级到本地 JSON 文件。因此 DB 断开后应返回 200 + degraded 标记，
 * 而非 500 内部错误——这是熔断器保护的核心目标。
 */
const DB_ENDPOINT = `${API_URL}/api/v1/data/history?tickers=SPY&startDate=2020-01-01&endDate=2024-12-31`;

let dockerAvailable = false;
let postgresRunning = false;

beforeAll(async () => {
  dockerAvailable = await isDockerAvailable();
  if (dockerAvailable) {
    postgresRunning = await isContainerRunning(CONTAINERS.postgres);
  }
}, 30000);

afterAll(async () => {
  // 确保测试结束（无论成功/失败）后恢复 PostgreSQL 网络
  if (dockerAvailable && postgresRunning) {
    try {
      await reconnectContainer(CONTAINERS.postgres);
    } catch {
      // 容器可能已重连，忽略错误
    }
  }
}, 30000);

describe('Chaos Experiment 1: Database Disconnect', () => {
  it.skipIf(!dockerAvailable)('应在 PostgreSQL 网络分区期间降级而非 500，且熔断器 Open', async () => {
    // 前置条件：PostgreSQL 容器必须运行
    if (!postgresRunning) {
      console.warn('skip: backtest-postgres 容器未运行');
      return;
    }

    // Step 1: 验证稳态——API 健康检查通过
    const steadyHealthy = await waitForHealthy(HEALTH_URL, 10000);
    expect(steadyHealthy).toBe(true);

    // Step 2: 断开 PostgreSQL 网络
    await disconnectContainer(CONTAINERS.postgres);

    try {
      // 等待连接池检测到故障（pg 连接超时 5s，熔断器统计窗口需累积失败）
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Step 3: 发送请求到 DB 相关端点，收集状态码
      const statusCodes: number[] = [];
      for (let i = 0; i < 10; i++) {
        try {
          const res = await fetch(DB_ENDPOINT);
          statusCodes.push(res.status);
        } catch {
          statusCodes.push(0); // 连接错误
        }
      }

      // 断言：不应出现 500 内部错误（熔断器应快速失败或降级到 JSON）
      const has500 = statusCodes.includes(500);
      expect(has500, `出现 500 内部错误，状态码: ${statusCodes}`).toBe(false);

      // 断言：熔断器应进入 Open 状态（1）
      // 注意：熔断器需 volumeThreshold（默认 5 次请求）后才计算错误率，
      // 10 次请求足以触发。resetTimeout=10s 后进入 halfOpen，需在窗口内检查。
      const breakerState = await getCircuitBreakerState('postgres', METRICS_URL);
      // 允许 open(1) 或 halfOpen(2)，因为时间窗口可能已进入探测
      expect(breakerState, `postgres 熔断器状态异常: ${breakerState}`).toBeGreaterThanOrEqual(1);
    } finally {
      // Step 4: 恢复 PostgreSQL 网络
      await reconnectContainer(CONTAINERS.postgres);
    }

    // Step 5: 验证恢复——等待熔断器 halfOpen 探测成功后回到 closed
    // resetTimeout=10s，探测查询成功后 closed。等待 15s 确保恢复。
    await new Promise((resolve) => setTimeout(resolve, 15000));

    const recoveredHealthy = await waitForHealthy(HEALTH_URL, 15000);
    expect(recoveredHealthy).toBe(true);

    // 恢复后请求应成功（200）
    const recoveryRes = await fetch(DB_ENDPOINT);
    expect(recoveryRes.ok).toBe(true);
  }, 60000); // 60s 超时：包含网络断开/恢复 + 熔断器恢复周期
});
