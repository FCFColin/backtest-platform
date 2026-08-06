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
  updateSet: () => 'name = $2, config = $3::jsonb, updated_at = NOW()',
  mapRow,
  toInsert: (tenantId, ownerUserId, input) => [
    tenantId,
    ownerUserId,
    input.name,
    JSON.stringify(input.config),
  ],
  toUpdate: (_id, input) => [input.name, JSON.stringify(input.config)],
});

export const listConfigs = repo.list;
export const getConfig = repo.get;
export const createConfig = repo.create;
export const updateConfig = repo.update;
export const deleteConfig = repo.delete;
