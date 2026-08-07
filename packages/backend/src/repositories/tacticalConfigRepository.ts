/**
 * 战术配置租户作用域仓储（P1-1 / ADR-032 / ADR-034）
 *
 * 企业理由：战术配置此前仅在内存中暂存，服务重启后丢失。持久化到 PostgreSQL 后由
 * RLS 强制租户隔离：读路径经 withTenantReadOnly()（读副本 + RLS），
 * 写路径经 withTenant()（主库 + RLS），在事务内激活 app.current_tenant_id。
 */
import { withTenantReadOnly } from '../db/pool.js';
import { rowMapper, iso } from './rowMapper.js';
import { createTenantCrudRepo } from './tenantCrudRepo.js';

interface TacticalConfigRecord {
  id: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface TacticalConfigInput {
  name: string;
  description?: string;
  config: Record<string, unknown>;
}

const mapRow = rowMapper<TacticalConfigRecord>({
  id: 'id',
  name: 'name',
  description: 'description',
  config: 'config',
  userId: 'user_id',
  createdAt: (r) => iso(r.created_at),
  updatedAt: (r) => iso(r.updated_at),
});

const FIELDS: Array<[keyof TacticalConfigInput, string]> = [
  ['name', 'name'],
  ['description', 'description'],
  ['config', 'config'],
];

const repo = createTenantCrudRepo<TacticalConfigRecord, TacticalConfigInput>({
  table: 'tactical_configs',
  selectCols: 'id, name, description, config, user_id, created_at, updated_at',
  orderBy: 'updated_at DESC',
  insertCols: 'tenant_id, user_id, name, description, config',
  updateSet: (input) => {
    let idx = 2;
    return FIELDS.filter(([k]) => input[k] !== undefined)
      .map(([, col]) => `${col} = $${idx++}`)
      .join(', ');
  },
  mapRow,
  sanitizeLimit: (limit) => Math.min(limit, 200),
  toInsert: (tenantId, ownerUserId, input) => [
    tenantId,
    ownerUserId,
    input.name,
    input.description ?? null,
    input.config,
  ],
  toUpdate: (_id, input) => FIELDS.filter(([k]) => input[k] !== undefined).map(([k]) => input[k]!),
});

export const findByTenant = repo.list;
export const findById = repo.get;
export const create = repo.create;
export const update = repo.update;
export const remove = repo.delete;

export async function count(tenantId: string): Promise<number> {
  return withTenantReadOnly(tenantId, async (client) => {
    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM tactical_configs');
    return rows[0].count as number;
  });
}
