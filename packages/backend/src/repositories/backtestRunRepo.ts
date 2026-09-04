// ADR-009: DB 状态 'pending' 对应领域语义的 queued（worker 直接写入 DB 状态）
import { withTenant, withPlatformContext } from '../db/pool.js';
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

interface BacktestRunSaveInput {
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

// A5 对账：Redis 数据丢失时 queued(pending) 行永悬——超时的置 failed，
// 用户视角从"任务消失"变为"明确失败"。nContext 平台逃逸跨租户清扫；
// worker 启动与周期调用。
// aliveCheck：队列存活守卫（依赖注入而非 import 队列单例，保持可测性）——
// 返回仍在队列中存活的 jobId 集合，命中者豁免清扫（BullMQ 正常接管中）。
export async function markStalePendingRunsFailed(
  olderThanMinutes = 30,
  aliveCheck?: (jobIds: string[]) => Promise<Set<string>>,
): Promise<number> {
  return withPlatformContext(async (client) => {
    if (aliveCheck) {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM backtest_runs
         WHERE status = 'pending' AND created_at < NOW() - ($1 || ' minutes')::interval`,
        [String(olderThanMinutes)],
      );
      const candidates = rows.map((r) => r.id);
      if (candidates.length === 0) return 0;
      const alive = await aliveCheck(candidates);
      const stale = candidates.filter((id) => !alive.has(id));
      if (stale.length === 0) return 0;
      const { rowCount } = await client.query(
        `UPDATE backtest_runs SET status = 'failed', result = $2::jsonb
         WHERE id = ANY($1::uuid[]) AND status = 'pending'`,
        [stale, JSON.stringify({ error: 'stale: job never started' })],
      );
      return rowCount ?? 0;
    }
    const { rowCount } = await client.query(
      `UPDATE backtest_runs SET status = 'failed', result = $2::jsonb
       WHERE status = 'pending' AND created_at < NOW() - ($1 || ' minutes')::interval`,
      [String(olderThanMinutes), JSON.stringify({ error: 'stale: job never started' })],
    );
    return rowCount ?? 0;
  });
}

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
       WHERE backtest_runs.tenant_id = EXCLUDED.tenant_id
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
