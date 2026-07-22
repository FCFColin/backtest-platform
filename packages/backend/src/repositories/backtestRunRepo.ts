/**
 * 回测运行历史（backtest_runs）租户作用域仓储（ADR-034）
 *
 * 企业理由：回测结果此前不落库——刷新即丢、无法回看历史、无法做用量计量。
 * 落到 Postgres + RLS 后，运行历史成为租户级资产，并为配额/计量（Phase 7）提供
 * 可审计的数据源。worker（异步任务）与同步回测均经此仓储经 withTenant() 写入。
 *
 * 设计取舍：result 为可空 JSONB——异步任务先以 status=running 入库（可选），
 * 完成后回填 result + status=completed；同步路径可一次性写入 completed。
 *
 * ADR-013 Phase 2：新增 save(run) 接收 Run 聚合根持久化。domain 层 status 用
 * 'queued'（语义更准确），DB schema 保持 'pending'（不破坏迁移），repo 层做映射。
 */
import { withTenant } from '../db/pool.js';
import { Run, type RunStatus } from '../domain/aggregates/run.js';

/** 回测运行状态（DB schema 值） */
export type BacktestRunStatus = 'pending' | 'running' | 'completed' | 'failed';

/** 领域 RunStatus → DB status 映射（'queued' 在 DB 层仍记为 'pending'） */
const DOMAIN_TO_DB_STATUS: Record<RunStatus, BacktestRunStatus> = {
  queued: 'pending',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'failed',
};

/** DB status → 领域 RunStatus 映射（'pending' 在领域层恢复为 'queued'） */
function dbToDomainStatus(db: BacktestRunStatus): RunStatus {
  return db === 'pending' ? 'queued' : db;
}

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
interface BacktestRunInput {
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
 * @param limit - 返回上限（默认 50，最大 200）
 */
export async function listRuns(
  tenantId: string,
  limit = 50,
  offset = 0,
): Promise<BacktestRunRecord[]> {
  const safeLimit = Math.min(Math.max(1, Math.trunc(limit)), 200);
  const safeOffset = Math.max(0, Math.trunc(offset));
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `SELECT ${SELECT_COLS} FROM backtest_runs ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset],
    );
    return rows.map(mapRow);
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

/**
 * 将 Run 聚合根持久化到 backtest_runs 表（UPSERT 语义）。
 *
 * 适用场景：worker / 同步路径在内存中操作 Run 聚合根后，将最终状态写入 DB。
 * domain 层 'queued' 自动映射为 DB 'pending'，'cancelled' 映射为 'failed'
 * （不破坏现有 schema）。事件由调用方在 save 后 pullEvents + dispatch。
 *
 * @param tenantId - 活跃组织 UUID
 * @param run - Run 聚合根实例
 * @returns 持久化后的 DB 行（含 created_at）
 */
export async function save(tenantId: string, run: Run): Promise<BacktestRunRecord> {
  const dbStatus = DOMAIN_TO_DB_STATUS[run.status];
  const result = run.result;
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO backtest_runs (id, tenant_id, owner_user_id, name, request, result, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         result = EXCLUDED.result,
         status = EXCLUDED.status
       RETURNING ${SELECT_COLS}`,
      [
        run.id,
        tenantId,
        run.ownerUserId ?? null,
        run.name ?? null,
        JSON.stringify(run.request),
        result === null || result === undefined ? null : JSON.stringify(result),
        dbStatus,
      ],
    );
    return mapRow(rows[0]);
  });
}

/**
 * 按 ID 取回 Run 聚合根（含 domain 层状态映射）。
 *
 * 'pending' 自动恢复为领域 'queued'，便于 application 层基于聚合根状态决策。
 * 不存在时返回 null。
 *
 * @param tenantId - 活跃组织 UUID
 * @param id - 运行 UUID
 */
export async function getRunAggregate(tenantId: string, id: string): Promise<Run | null> {
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(`SELECT ${SELECT_COLS} FROM backtest_runs WHERE id = $1`, [
      id,
    ]);
    if (rows.length === 0) return null;
    const row = rows[0];
    return Run.fromRow({
      id: row.id,
      name: row.name,
      request: row.request,
      result: row.result,
      status: dbToDomainStatus(row.status),
      ownerUserId: row.owner_user_id,
      // startedAt/completedAt 未在 schema 中持久化，此处不重建
      skipInitialEvent: true,
    });
  });
}
