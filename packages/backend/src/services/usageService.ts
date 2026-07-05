/**
 * 用量计量服务（ADR-037）
 *
 * 企业理由：配额判定与计费对账都依赖"某组织本计费周期内某指标的累计用量"。本服务提供
 * 双写：明细事件（usage_events，审计/BI）+ 月度聚合（usage_counters，配额权威），并以
 * Redis 月度计数器做快路径读，DB 作为跨实例一致性兜底。
 *
 * 隔离：写入经 withTenant（RLS 收敛到当前组织）。Redis 键含 org/period/metric。
 */
import { withTenant } from '../db/index.js';
import { appRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { currentPeriod } from '../config/planLimits.js';

function counterKey(orgId: string, period: string, metric: string): string {
  return `usage:${orgId}:${period}:${metric}`;
}

/** 月底过期：粗略给 35 天 TTL，足以覆盖一个计费周期 */
const COUNTER_TTL_SEC = 35 * 24 * 60 * 60;

/**
 * 记录一次用量：明细 + 月度聚合（DB）并递增 Redis 快路径计数。
 *
 * @param orgId - 组织 UUID
 * @param metric - 指标名（见 USAGE_METRIC）
 * @param quantity - 数量（默认 1）
 * @param metadata - 附加上下文（可空）
 */
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
  // Redis 快路径（失败不影响主流程）
  try {
    const key = counterKey(orgId, period, metric);
    const next = await appRedis.incrby(key, quantity);
    if (next === quantity) await appRedis.expire(key, COUNTER_TTL_SEC);
  } catch (err) {
    logger.warn({ err: String(err), orgId, metric }, '[usageService] Redis 计数失败（降级 DB）');
  }
}

/**
 * 读取本计费周期某指标的累计用量（优先 Redis，回退 DB）。
 *
 * @param orgId - 组织 UUID
 * @param metric - 指标名
 * @returns 累计数量
 */
export async function getMonthlyUsage(orgId: string, metric: string): Promise<number> {
  const period = currentPeriod();
  try {
    const cached = await appRedis.get(counterKey(orgId, period, metric));
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
      // 回填 Redis，降低后续读放大
      try {
        const key = counterKey(orgId, period, metric);
        await appRedis.set(key, String(count), 'EX', COUNTER_TTL_SEC);
      } catch {
        /* ignore */
      }
      return count;
    });
  } catch (err) {
    logger.error({ err: String(err), orgId, metric }, '[usageService] 读取用量失败');
    return 0;
  }
}
