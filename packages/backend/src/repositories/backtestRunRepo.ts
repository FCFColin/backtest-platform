/**
 * 回测运行历史（backtest_runs）租户作用域仓储（ADR-034）
 *
 * 企业理由：回测结果此前不落库——刷新即丢、无法回看历史、无法做用量计量。
 * 落到 Postgres + RLS 后，运行历史成为租户级资产，并为配额/计量（Phase 7）提供
 * 可审计的数据源。worker（异步任务）与同步回测均经此仓储经 withTenant() 写入。
 * 读路径（listRuns/getRun）走 withTenantReadOnly（读副本 + RLS），
 * 写路径（createRun/save/deleteRun）走 withTenant（主库 + RLS）。
 *
 * ADR-013 Phase 2：save(run) 接收 Run 聚合根持久化。domain 层 status 用
 * 'queued'（语义更准确），DB schema 保持 'pending'（不破坏迁移），repo 层做映射。
 */
import { withTenant } from '../db/pool.js';
import { Run, type RunStatus } from '../domain/aggregates/run.js';
import { rowMapper, iso } from './rowMapper.js';
import { createTenantCrudRepo } from './tenantCrudRepo.js';

type BacktestRunStatus = 'pending' | 'running' | 'completed' | 'failed';

const DOMAIN_TO_DB_STATUS: Record<RunStatus, BacktestRunStatus> = {
  queued: 'pending',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'failed',
};

export interface BacktestRunRecord {
  id: string;
  name: string | null;
  request: unknown;
  result: unknown | null;
  status: BacktestRunStatus;
  ownerUserId: string | null;
  createdAt: string;
}

interface BacktestRunInput {
  name?: string | null;
  request: unknown;
  result?: unknown | null;
  status?: BacktestRunStatus;
}

const mapRow = rowMapper<BacktestRunRecord>({
  id: 'id',
  name: 'name',
  request: 'request',
  result: 'result',
  status: 'status',
  ownerUserId: 'owner_user_id',
  createdAt: (r) => iso(r.created_at),
});

const serializeJson = (v: unknown): string | null =>
  v === undefined || v === null ? null : JSON.stringify(v);

const repo = createTenantCrudRepo<BacktestRunRecord, BacktestRunInput>({
  table: 'backtest_runs',
  selectCols: 'id, name, request, result, status, owner_user_id, created_at',
  orderBy: 'created_at DESC',
  sanitizeLimit: (limit) => Math.min(Math.max(1, Math.trunc(limit)), 200),
  insertCols: 'tenant_id, owner_user_id, name, request, result, status',
  updateSet: 'name = $2, request = $3::jsonb, result = $4::jsonb, status = $5',
  mapRow,
  toInsert: (tenantId, ownerUserId, input) => [
    tenantId,
    ownerUserId,
    input.name ?? null,
    JSON.stringify(input.request),
    serializeJson(input.result),
    input.status ?? 'completed',
  ],
  toUpdate: (_id, input) => [
    input.name ?? null,
    JSON.stringify(input.request),
    serializeJson(input.result),
    input.status ?? 'completed',
  ],
});

export const listRuns = repo.list;
export const getRun = repo.get;
export const createRun = repo.create;
export const deleteRun = repo.delete;

/**
 * 将 Run 聚合根持久化到 backtest_runs 表（UPSERT 语义）。
 *
 * @param tenantId - 活跃组织 UUID
 * @param run - Run 聚合根实例
 * @returns 持久化后的 DB 行（含 created_at）
 */
export async function save(tenantId: string, run: Run): Promise<BacktestRunRecord> {
  const result = run.result;
  return withTenant(tenantId, async (client) => {
    const { rows } = await client.query(
      `INSERT INTO backtest_runs (id, tenant_id, owner_user_id, name, request, result, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         result = EXCLUDED.result,
         status = EXCLUDED.status
       RETURNING id, name, request, result, status, owner_user_id, created_at`,
      [
        run.id,
        tenantId,
        run.ownerUserId ?? null,
        run.name ?? null,
        JSON.stringify(run.request),
        serializeJson(result),
        DOMAIN_TO_DB_STATUS[run.status],
      ],
    );
    return mapRow(rows[0]);
  });
}
