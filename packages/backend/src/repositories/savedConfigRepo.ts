/**
 * 命名配置（saved_configs）租户作用域仓储（ADR-034）
 *
 * 企业理由：回测页"保存/加载命名配置"此前依赖浏览器 localStorage，无法跨设备/团队共享。
 * 迁移到 Postgres + RLS 后，配置成为租户级资产：读路径经 withTenantReadOnly()（读副本 + RLS），
 * 写路径经 withTenant()（主库 + RLS）强制隔离。
 * config 以 JSONB 原样存储完整回测请求（组合 + 参数），加载时直接回填前端。
 */
import { rowMapper, iso } from './rowMapper.js';
import { createTenantCrudRepo } from './tenantCrudRepo.js';

interface SavedConfigRecord {
  id: string;
  name: string;
  config: unknown;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SavedConfigInput {
  name: string;
  config: unknown;
}

const mapRow = rowMapper<SavedConfigRecord>({
  id: 'id',
  name: 'name',
  config: 'config',
  ownerUserId: 'owner_user_id',
  createdAt: (r) => iso(r.created_at),
  updatedAt: (r) => iso(r.updated_at),
});

const repo = createTenantCrudRepo<SavedConfigRecord, SavedConfigInput>({
  table: 'saved_configs',
  selectCols: 'id, name, config, owner_user_id, created_at, updated_at',
  orderBy: 'updated_at DESC',
  sanitizeLimit: (limit) => Math.min(limit, 200),
  insertCols: 'tenant_id, owner_user_id, name, config',
  updateSet: 'name = $2, config = $3::jsonb, updated_at = NOW()',
  mapRow,
  toInsert: (tenantId, ownerUserId, input) => [
    tenantId,
    ownerUserId,
    input.name,
    JSON.stringify(input.config),
  ],
  toUpdate: (id, input) => [input.name, JSON.stringify(input.config)],
});

export const listConfigs = repo.list;
export const getConfig = repo.get;
export const createConfig = repo.create;
export const updateConfig = repo.update;
export const deleteConfig = repo.delete;
