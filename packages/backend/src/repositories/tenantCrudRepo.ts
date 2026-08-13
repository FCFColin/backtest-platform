import { withTenant, withTenantReadOnly } from '../db/pool.js';
import { queryRow, queryMany } from './rowMapper.js';

interface TenantCrudConfig<TRecord, TInput> {
  table: string;
  selectCols: string;
  orderBy: string;
  insertCols: string;
  updateSet: string | ((input: TInput) => string);
  mapRow: (row: Record<string, unknown>) => TRecord;
  sanitizeLimit: (limit: number) => number;
  toInsert: (tenantId: string, ownerUserId: string | null, input: TInput) => unknown[];
  toUpdate: (id: string, input: TInput) => unknown[];
}

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
      queryRow(client, `SELECT ${selectCols} FROM ${table} WHERE id = $1`, [id], mapRow),
    );
  return {
    list: async (tenantId: string, limit = 50, offset = 0): Promise<TRecord[]> =>
      withTenantReadOnly(tenantId, (client) =>
        queryMany(
          client,
          `SELECT ${selectCols} FROM ${table} ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
          [sanitizeLimit(limit), Math.max(0, Math.trunc(offset))],
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
        return queryRow(
          client,
          `UPDATE ${table} SET ${set} WHERE id = $1 RETURNING ${selectCols}`,
          [id, ...toUpdate(id, input)],
          mapRow,
        );
      }),
    delete: async (tenantId: string, id: string): Promise<boolean> =>
      withTenant(tenantId, async (client) => {
        const { rowCount } = await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
        return (rowCount ?? 0) > 0;
      }),
  };
}
