// ADR-034/013: domain status 'queued' → DB 'pending'（不破坏迁移）
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
    input.status ?? 'pending',
  ],
  toUpdate: (_id, input) => [
    input.name ?? null,
    JSON.stringify(input.request),
    serializeJson(input.result),
    input.status ?? 'pending',
  ],
});

export const listRuns = repo.list;
export const getRun = repo.get;
export const createRun = repo.create;
export const deleteRun = repo.delete;

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
