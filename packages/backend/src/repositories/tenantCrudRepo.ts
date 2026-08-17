import { withTenant, withTenantReadOnly } from '../db/pool.js';
import { queryRow, queryMany } from './rowMapper.js';

interface TenantCrudConfig<TRecord, TInput> {
  table: string;
  selectCols: string;
  orderBy: string;
  insertCols: string;
  updateSet: string | ((input: TInput) => string);
  mapRow: (row: Record<string, unknown>) => TRecord;
  sanitizeLimit?: (limit: number) => number;
  toInsert: (tenantId: string, ownerUserId: string | null, input: TInput) => unknown[];
  toUpdate: (id: string, input: TInput) => unknown[];
}

// 下限 0 防负值 → PG LIMIT -1 = 无上限；上限 200 统一分页封顶（LIMIT 0 = 空页，合法）
const defaultSanitizeLimit = (limit: number): number =>
  Math.min(Math.max(0, Math.trunc(limit)), 200);

export function createTenantCrudRepo<TRecord, TInput>(cfg: TenantCrudConfig<TRecord, TInput>) {
  const {
    table,
    selectCols,
    orderBy,
    insertCols,
    updateSet,
    mapRow,
    sanitizeLimit,
    toInsert,
    toUpdate,
  } = cfg;
  const get = async (tenantId: string, id: string): Promise<TRecord | null> =>
    withTenantReadOnly(tenantId, (client) =>
      queryRow(
        client,
        `SELECT ${selectCols} FROM ${table} WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id],
        mapRow,
      ),
    );
  return {
    list: async (tenantId: string, limit = 50, offset = 0): Promise<TRecord[]> =>
      withTenantReadOnly(tenantId, (client) =>
        queryMany(
          client,
          `SELECT ${selectCols} FROM ${table} WHERE tenant_id = $1 ORDER BY ${orderBy} LIMIT $2 OFFSET $3`,
          [
            tenantId,
            (sanitizeLimit ?? defaultSanitizeLimit)(limit),
            Math.max(0, Math.trunc(offset)),
          ],
          mapRow,
        ),
      ),
    get,
    create: async (tenantId: string, ownerUserId: string | null, input: TInput): Promise<TRecord> =>
      withTenant(tenantId, async (client) => {
        const values = toInsert(tenantId, ownerUserId, input);
        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
        const { rows } = await client.query(
          `INSERT INTO ${table} (${insertCols}) VALUES (${placeholders}) RETURNING ${selectCols}`,
          values,
        );
        return mapRow(rows[0]);
      }),
    update: async (tenantId: string, id: string, input: TInput): Promise<TRecord | null> =>
      withTenant(tenantId, (client) => {
        const set = typeof updateSet === 'string' ? updateSet : updateSet(input);
        if (!set) return get(tenantId, id);
        const values = toUpdate(id, input);
        return queryRow(
          client,
          `UPDATE ${table} SET ${set} WHERE id = $1 AND tenant_id = $${values.length + 2} RETURNING ${selectCols}`,
          [id, ...values, tenantId],
          mapRow,
        );
      }),
    delete: async (tenantId: string, id: string): Promise<boolean> =>
      withTenant(tenantId, async (client) => {
        const { rowCount } = await client.query(
          `DELETE FROM ${table} WHERE id = $1 AND tenant_id = $2`,
          [id, tenantId],
        );
        return (rowCount ?? 0) > 0;
      }),
  };
}
