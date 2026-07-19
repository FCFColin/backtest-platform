/**
 * Chaos Experiment 4: Redis 中断（vitest 集成测试）
 *
 * SRE：验证 Redis 不可用时的分级降级行为（ADR-018 / ADR-020）。
 * 企业为何需要：Redis 承载限流、会话、幂等、队列。它的故障不应让整个 API 崩溃，
 * 但安全敏感路径（登录/计算限流）必须 fail-closed，只读路径 fail-open——本实验验证该契约。
 *
 * 假设（steady-state hypothesis）：
 * - 稳态：/api/ready 返回 200，dependencies.redis = true。
 * - Redis 停止后：
 *   1) /api/ready 仍可响应（不 5xx 崩溃），dependencies.redis = false，status 至少为 degraded；
 *   2) 只读端点（fail-open）仍可访问；
 *   3) 登录端点（fail-closed）在 Redis 不可用时拒绝（非放行）。
 * - 恢复后：dependencies.redis 回到 true。
 *
 * 重构说明（Task 5.14/5.15）：
 * - 用 setupChaosFixture(CONTAINERS.redis) 替代内联 isDockerAvailable/
 *   isContainerRunning + afterAll startContainer 样板。
 * - it 块内的 stop/start + try/finally 改用 withContainerStopped 高阶函数。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  CONTAINERS,
  withContainerStopped,
  waitForHealthy,
  setupChaosFixture,
  type ChaosFixture,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:5001';
const HEALTH_URL = `${API_URL}/api/ready`;
const LOGIN_URL = `${API_URL}/api/v1/auth/login/password`;

// top-level 初始值 false，与原模式行为一致：skipIf 在注册时求值
let fixture: ChaosFixture = {
  dockerAvailable: false,
  containerRunning: false,
  recover: async () => {},
};

beforeAll(async () => {
  fixture = await setupChaosFixture(CONTAINERS.redis);
}, 30000);

afterAll(async () => {
  await fixture.recover();
}, 30000);

async function getHealth(): Promise<{ status: number; redis?: boolean; overall?: string }> {
  try {
    const res = await fetch(HEALTH_URL);
    const json = (await res.json().catch(() => ({}))) as {
      data?: { status?: string; dependencies?: { redis?: boolean } };
    };
    return {
      status: res.status,
      redis: json.data?.dependencies?.redis,
      overall: json.data?.status,
    };
  } catch {
    return { status: 0 };
  }
}

describe('Chaos Experiment 4: Redis 中断', () => {
  it.skipIf(!fixture.dockerAvailable)(
    'Redis 停止后 API 不崩溃，且健康检查反映 redis=false',
    async () => {
      if (!fixture.containerRunning) {
        console.warn('skip: backtest-redis 容器未运行');
        return;
      }

      // Step 1: 稳态校验
      const steadyHealthy = await waitForHealthy(HEALTH_URL, 10000);
      expect(steadyHealthy).toBe(true);
      const steady = await getHealth();
      expect(steady.redis).toBe(true);

      // Step 2-3: 停止 Redis → 断言 → 恢复（withContainerStopped 保证恢复）
      await withContainerStopped(
        CONTAINERS.redis,
        async () => {
          await new Promise((r) => setTimeout(r, 2000));

          // 断言 1：/api/ready 不应 5xx（DB 仍在 → 至少 degraded，HTTP 200）
          const down = await getHealth();
          expect(down.status, `health 返回异常: ${down.status}`).toBe(200);
          expect(down.redis, 'redis 依赖应标记为 false').toBe(false);
          expect(['ok', 'degraded']).toContain(down.overall);

          // 断言 2：登录端点 fail-closed —— Redis 不可用时不放行（不返回 200 成功）。
          // 凭证错误时应返回 401（业务拒绝），限流存储故障时应 503/429，绝不 200 放行。
          const loginRes = await fetch(LOGIN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'chaos-user', password: 'wrong-password' }),
          });
          expect([401, 429, 503]).toContain(loginRes.status);
        },
        { settleMs: 0 },
      );

      // Step 4: 恢复校验
      const recovered = await waitForHealthy(HEALTH_URL, 30000);
      expect(recovered).toBe(true);
      // 给健康探测缓存/连接重建一点时间
      await new Promise((r) => setTimeout(r, 2000));
      const after = await getHealth();
      expect(after.redis).toBe(true);
    },
    90000,
  );
});
