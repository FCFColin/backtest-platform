// ADR-037: 双写 usage_events（审计/BI）+ usage_counters（配额权威），Redis 快路径读
import { withTenant } from '../../db/pool.js';
import { appRedis } from '../../infrastructure/redisClient.js';
import { logger } from '../../utils/logger.js';
import { currentPeriod } from './planLimitsService.js';

function counterKey(orgId: string, period: string, metric: string): string {
  return `usage:${orgId}:${period}:${metric}`;
}

const COUNTER_TTL_SEC = 35 * 24 * 60 * 60;

export async function recordUsage(
  orgId: string,
  metric: string,
  quantity = 1,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const period = currentPeriod();
  try {
    await withTenant(orgId, async (client) => {
      await client.query(
        'INSERT INTO usage_events (org_id, metric, quantity, metadata) VALUES ($1, $2, $3, $4)',
        [orgId, metric, quantity, metadata ? JSON.stringify(metadata) : null],
      );
      await client.query(
        `INSERT INTO usage_counters (org_id, period, metric, count) VALUES ($1, $2, $3, $4)
         ON CONFLICT (org_id, period, metric) DO UPDATE SET count = usage_counters.count + EXCLUDED.count, updated_at = NOW()`,
        [orgId, period, metric, quantity],
      );
    });
  } catch (err) {
    logger.error({ err: String(err), orgId, metric }, '[usageService] 记录用量失败');
  }
  try {
    const key = counterKey(orgId, period, metric);
    const next = await appRedis.incrby(key, quantity);
    if (next === quantity) await appRedis.expire(key, COUNTER_TTL_SEC);
  } catch (err) {
    logger.warn({ err: String(err), orgId, metric }, '[usageService] Redis 计数失败（降级 DB）');
  }
}

// 优先 Redis，回退 DB
export async function getMonthlyUsage(orgId: string, metric: string): Promise<number> {
  const period = currentPeriod();
  const key = counterKey(orgId, period, metric);
  try {
    const cached = await appRedis.get(key);
    if (cached !== null) {
      const n = Number(cached);
      if (Number.isFinite(n)) return n;
    }
  } catch {
    /* 回退 DB */
  }
  try {
    return await withTenant(orgId, async (client) => {
      const { rows } = await client.query(
        'SELECT count FROM usage_counters WHERE org_id = $1 AND period = $2 AND metric = $3',
        [orgId, period, metric],
      );
      const count = rows.length > 0 ? Number(rows[0].count) : 0;
      try {
        await appRedis.set(key, String(count), 'EX', COUNTER_TTL_SEC);
      } catch {
        /* ignore */
      }
      return count;
    });
  } catch (err) {
    // 配额权威读取失败时向上抛错，由 quota 中间件 fail-closed（503）兜底，避免放行超额用量
    logger.error({ err: String(err), orgId, metric }, '[usageService] 读取用量失败');
    throw err;
  }
}
