// ADR-009: DB 状态 'pending' 对应领域语义的 queued（worker 直接写入 DB 状态）
import { withTenant } from '../db/pool.js';
import { rowMapper, iso } from './rowMapper.js';
import { createTenantCrudRepo } from './tenantCrudRepo.js';

type BacktestRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface BacktestRunRecord {
  id: string;
  name: string | null;
  request: unknown;
  result: unknown | null;
  status: BacktestRunStatus;
  ownerUserId: string | null;
  createdAt: string;
}

export interface BacktestRunSaveInput {
  id: string;
  name?: string | null;
  request: unknown;
  result?: unknown | null;
  status: BacktestRunStatus;
  ownerUserId?: string | null;
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

export async function save(
  tenantId: string,
  input: BacktestRunSaveInput,
): Promise<BacktestRunRecord> {
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
        input.id,
        tenantId,
        input.ownerUserId ?? null,
        input.name ?? null,
        JSON.stringify(input.request),
        serializeJson(input.result ?? null),
        input.status,
      ],
    );
    return mapRow(rows[0]);
  });
}
