/**
 * 登录事件审计服务（P1-09 等保三级 8.1.10 审计）
 *
 * 将每次登录尝试（成功/失败）写入 login_events 表，保留 180 天供审计追溯。
 * 与 Redis 实时锁定（loginLockout.ts）互补：
 * - Redis：短期计数（5min/10次）→ 实时封锁
 * - login_events：持久化记录 → 审计查询 + 异常分析
 *
 * 等保三级 8.1.10：审计覆盖到每个用户，对重要的用户行为和重要安全事件进行审计。
 */
import { getPool } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';

export interface LoginEventInput {
  userId?: string | null;
  username?: string;
  ip: string;
  userAgent?: string;
  success: boolean;
  failureReason?: string;
}

/**
 * 记录一次登录事件到 login_events 表。
 *
 * 失败不阻塞主流程（仅 warn 日志），因为审计记录失败不应阻止登录响应。
 *
 * @param event - 登录事件详情
 */
export async function recordLoginEvent(event: LoginEventInput): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO login_events (user_id, username, ip_address, user_agent, success, failure_reason)
       VALUES ($1, $2, $3::inet, $4, $5, $6)`,
      [
        event.userId ?? null,
        event.username ?? null,
        event.ip || null,
        event.userAgent ?? null,
        event.success,
        event.failureReason ?? null,
      ],
    );
  } catch (err) {
    // 审计记录失败不应阻塞登录流程，仅记录警告
    logger.warn(
      { err: String(err), event: { ...event, userAgent: undefined } },
      '[loginAudit] 登录事件记录失败',
    );
  }
}

/**
 * 清理过期的登录事件记录（等保三级保留 180 天后可删除）。
 *
 * 供定时任务（cron / BullMQ repeat job）调用。
 *
 * @param retentionDays - 保留天数（默认从 config.AUDIT_RETENTION_DAYS 读取）
 * @returns 删除的记录数
 */
export async function cleanupOldLoginEvents(retentionDays?: number): Promise<number> {
  const days = retentionDays ?? 180;
  const pool = getPool();
  const { rowCount } = await pool.query(
    'DELETE FROM login_events WHERE created_at < NOW() - $1::interval',
    [`${days} days`],
  );
  if (rowCount && rowCount > 0) {
    logger.info({ deleted: rowCount, retentionDays: days }, '[loginAudit] 清理过期登录事件');
  }
  return rowCount ?? 0;
}
