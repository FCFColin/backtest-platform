/**
 * Chaos Experiment 2: External Service Unreachable（vitest 集成测试）
 *
 * SRE: 验证外部数据服务（Go data-fetcher）不可达时的降级行为
 * 企业为何需要：第三方 API 不稳定是常见故障源，熔断器 + 本地缓存降级
 * 是可用性保障。本测试验证 go_data_service 熔断器 Open 后降级到本地数据。
 *
 * 权衡：原脚本使用 Linux tc 注入延迟，跨平台不可用。
 * 本测试采用 Option C（停止 data-fetcher 容器）模拟服务不可达，
 * 最可移植且能验证熔断器 + 降级链路。
 *
 * 重构说明（Task 6.3）：
 * - 原 experiment-2-external-delay.ts 使用 tc qdisc（Linux only），Windows 不可用。
 * - 本测试使用 docker stop/start 跨平台操作容器。
 * - 断言 go_data_service 熔断器 Open，且 /api/v1/data/history 降级到本地数据（degraded 标记）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  CONTAINERS,
  isDockerAvailable,
  isContainerRunning,
  stopContainer,
  startContainer,
  getCircuitBreakerState,
  waitForHealthy,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:5001';
const HEALTH_URL = `${API_URL}/api/health`;
const METRICS_URL = `${API_URL}/api/metrics`;

/**
 * /api/v1/data/history 端点优先调用 Go 数据服务（goDataServiceBreaker），
 * 失败后降级到 PostgreSQL / JSON 文件。Go 服务不可达时应返回 200 + degraded 标记。
 */
const DATA_ENDPOINT = `${API_URL}/api/v1/data/history?tickers=SPY&startDate=2020-01-01&endDate=2024-12-31`;

let dockerAvailable = false;
let dataFetcherRunning = false;

beforeAll(async () => {
  dockerAvailable = await isDockerAvailable();
  if (dockerAvailable) {
    dataFetcherRunning = await isContainerRunning(CONTAINERS.dataFetcher);
  }
}, 30000);

afterAll(async () => {
  // 确保测试结束后恢复 data-fetcher 容器
  if (dockerAvailable && dataFetcherRunning) {
    try {
      await startContainer(CONTAINERS.dataFetcher);
    } catch {
      // 容器可能已启动，忽略错误
    }
  }
}, 30000);

describe('Chaos Experiment 2: External Service Unreachable', () => {
  it.skipIf(!dockerAvailable)('应在 data-fetcher 不可达时降级到本地数据，且熔断器 Open', async () => {
    // 前置条件：data-fetcher 容器必须运行
    if (!dataFetcherRunning) {
      console.warn('skip: backtest-data-fetcher 容器未运行');
      return;
    }

    // Step 1: 验证稳态——API 健康检查通过
    const steadyHealthy = await waitForHealthy(HEALTH_URL, 10000);
    expect(steadyHealthy).toBe(true);

    // Step 2: 停止 data-fetcher 容器（模拟服务不可达）
    await stopContainer(CONTAINERS.dataFetcher);

    try {
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
      expect(breakerState, `go_data_service 熔断器状态异常: ${breakerState}`).toBeGreaterThanOrEqual(1);
    } finally {
      // Step 4: 恢复 data-fetcher 容器
      await startContainer(CONTAINERS.dataFetcher);
    }

    // Step 5: 验证恢复——等待容器启动 + 熔断器 halfOpen 探测成功
    // goDataServiceBreaker resetTimeout=30s，但容器启动后健康检查通过即可服务
    const recoveredHealthy = await waitForHealthy(HEALTH_URL, 30000);
    expect(recoveredHealthy).toBe(true);
  }, 90000); // 90s 超时：包含容器停止/启动 + 熔断器恢复周期
});
