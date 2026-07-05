/**
 * 回测运行历史（backtest_runs）租户作用域仓储（ADR-034）
 *
 * 企业理由：回测结果此前不落库——刷新即丢、无法回看历史、无法做用量计量。
 * 落到 Postgres + RLS 后，运行历史成为租户级资产，并为配额/计量（Phase 7）提供
 * 可审计的数据源。worker（异步任务）与同步回测均经此仓储经 withTenant() 写入。
 *
 * 设计取舍：result 为可空 JSONB——异步任务先以 status=running 入库（可选），
 * 完成后回填 result + status=completed；同步路径可一次性写入 completed。
 */
import { withTenant } from '../db/index.js';

/** 回测运行状态 */
export type BacktestRunStatus = 'pending' | 'running' | 'completed' | 'failed';

/** 回测运行记录 */
export interface BacktestRunRecord {
  id: string;
  name: string | null;
  request: unknown;
  result: unknown | null;
  status: BacktestRunStatus;
  ownerUserId: string | null;
  createdAt: string;
}

/** 创建回测运行输入 */
export interface BacktestRunInput {
  name?: string | null;
  request: unknown;
  result?: unknown | null;
  status?: BacktestRunStatus;
}

function mapRow(row: {
  id: string;
  name: string | null;
  request: unknown;
  result: unknown | null;
  status: BacktestRunStatus;
  owner_user_id: string | null;
  created_at: Date | string;
}): BacktestRunRecord {
  return {
    id: row.id,
    name: row.name,
    request: row.request,
    result: row.result,
    status: row.status,
    ownerUserId: row.owner_user_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

const SELECT_COLS = 'id, name, request, result, status, owner_user_id, created_at';

/**
 * 列出租户下的回测运行历史（按创建时间倒序，可限制条数）。
 *
 * @param tenantId - 活跃组织 UUID
 * @param limit - 返回上限（默认 100，最大 1000）
 * @param offset - 偏移量（默认 0）
 */
export async function listRuns(
  tenantId: string,
  limit = 100,
  offset = 0,
): Promise<{ rows: BacktestRunRecord[]; total: number }> {
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 1000);
  const safeOffset = Math.max(0, Math.trunc(offset));
  return withTenant(tenantId, async (client) => {
    const [{ rows }, { rows: countRows }] = await Promise.all([
      client.query(
        `SELECT ${SELECT_COLS} FROM backtest_runs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [safeLimit, safeOffset],
      ),
      client.query(`SELECT COUNT(*)::int AS total FROM backtest_runs`, []),
    ]);
    return { rows: rows.map(mapRow), total: countRows[0].total };
  });
}

/**
 * 按 ID 获取回测运行（不存在返回 null）。
 *
 * @param tenantId - 活跃组织 UUID
 * @param id - 运行 UUID
 */
export async function getRun(tenantId: string, id: string): Promise<BacktestRunRecord | null> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(`SELECT ${SELECT_COLS} FROM backtest_runs WHERE id = $1`, [
      id,
    ]);
    return rows.length > 0 ? mapRow(rows[0]) : null;
  });
}

/**
 * 创建一条回测运行记录。
 *
 * @param tenantId - 活跃组织 UUID
 * @param ownerUserId - 提交者 UUID（可空）
 * @param input - 运行内容（request 必填，result/status 可选）
 */
export async function createRun(
  tenantId: string,
  ownerUserId: string | null,
  input: BacktestRunInput,
): Promise<BacktestRunRecord> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO backtest_runs (tenant_id, owner_user_id, name, request, result, status)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
       RETURNING ${SELECT_COLS}`,
      [
        tenantId,
        ownerUserId,
        input.name ?? null,
        JSON.stringify(input.request),
        input.result === undefined || input.result === null ? null : JSON.stringify(input.result),
        input.status ?? 'completed',
      ],
    );
    return mapRow(rows[0]);
  });
}

/**
 * 删除回测运行记录。返回是否删除成功。
 *
 * @param tenantId - 活跃组织 UUID
 * @param id - 运行 UUID
 */
export async function deleteRun(tenantId: string, id: string): Promise<boolean> {
  return withTenant(tenantId, async (client) => {
    const { rowCount } = await client.query('DELETE FROM backtest_runs WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  });
}
