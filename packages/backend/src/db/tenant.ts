/**
 * 租户上下文（RLS 强制点，ADR-032）
 *
 * 多租户隔离的安全保证由 Postgres RLS 提供，而非靠每个查询都记得加 `WHERE tenant_id=`。
 */

import pg from 'pg';
import { logger } from '../utils/logger.js';
import { getPool } from './pool.js';

/** UUID v4 校验（防御性，set_config 已通过 $1 参数化避免注入） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 在租户上下文事务中执行回调（RLS 强制点，ADR-032）。
 *
 * 企业理由：多租户隔离的安全保证由 Postgres RLS 提供，而非靠每个查询都记得
 * 加 `WHERE tenant_id=`。本助手在事务内通过 `set_config('app.current_tenant_id', $1, true)`
 * （is_local=true，等价 SET LOCAL）注入当前租户，使 009 迁移定义的 RLS 策略生效。
 *
 * 关键纪律：
 * - 必须使用事务级（SET LOCAL / is_local=true）而非会话级设置，否则在 PgBouncer
 *   transaction-pooling 下连接复用会串租户。事务结束后该设置自动失效。
 * - 所有租户作用域的查询都应经由本助手获得的 client 执行；脱离本助手的查询因
 *   `app.current_tenant_id` 未设置而读到零行 / 写被拒绝（fail-safe）。
 *
 * @typeParam T - 回调返回类型
 * @param tenantId - 当前租户（组织）UUID
 * @param fn - 接收已设置租户上下文的事务 client 的回调
 * @returns 回调结果
 * @throws 当 tenantId 非法 UUID，或回调/事务失败（自动 ROLLBACK）时
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error(`withTenant: 非法 tenantId（需为 UUID）: ${tenantId}`);
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 事务级设置（is_local=true）：随 COMMIT/ROLLBACK 自动复位，PgBouncer 安全
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, '[db] withTenant ROLLBACK 失败');
    }
    throw err;
  } finally {
    client.release();
  }
}
