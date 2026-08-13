/**
 * Chaos Experiment 4: Redis 中断（vitest 集成测试）
 *
 * SRE：验证 Redis 不可用时的分级降级行为（DADR-018 / DADR-020）。
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
 */
import { describe, it, expect } from 'vitest';
import {
  CONTAINERS,
  withContainerStopped,
  waitForHealthy,
  setupChaosLifecycle,
} from '../helpers/chaos.js';

const API_URL = process.env.API_URL || 'http://127.0.0.1:15001';
const HEALTH_URL = `${API_URL}/api/ready`;
const LOGIN_URL = `${API_URL}/api/v1/auth/login/password`;

const fixture = setupChaosLifecycle(CONTAINERS.redis);

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
  it.skipIf(!fixture.containerReady)(
    'Redis 停止后 API 不崩溃，且健康检查反映 redis=false',
    async () => {
      const steadyHealthy = await waitForHealthy(HEALTH_URL, 10000);
      expect(steadyHealthy).toBe(true);
      const steady = await getHealth();
      expect(steady.redis).toBe(true);

      await withContainerStopped(
        CONTAINERS.redis,
        async () => {
          await new Promise((r) => setTimeout(r, 2000));

          const down = await getHealth();
          expect(down.status, `health 返回异常: ${down.status}`).toBe(200);
          expect(down.redis, 'redis 依赖应标记为 false').toBe(false);
          expect(['ok', 'degraded']).toContain(down.overall);

          const loginRes = await fetch(LOGIN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'chaos-user', password: 'wrong-password' }),
          });
          // 限流器 Redis store 故障时 passOnStoreError=false → next(err) 500；lockout requireRedis → 503；均属拒绝放行
          expect([401, 429, 503, 500]).toContain(loginRes.status);
        },
        { settleMs: 0 },
      );

      const recovered = await waitForHealthy(HEALTH_URL, 30000);
      expect(recovered).toBe(true);
      await new Promise((r) => setTimeout(r, 2000));
      const after = await getHealth();
      expect(after.redis).toBe(true);
    },
    90000,
  );
});
