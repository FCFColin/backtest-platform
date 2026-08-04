import { withTenant, withTenantReadOnly } from '../db/pool.js';

export interface TenantCrudConfig<TRecord, TInput> {
  table: string;
  selectCols: string;
  orderBy: string;
  insertCols: string;
  updateSet: string;
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
  return {
    list: async (tenantId: string, limit = 50, offset = 0): Promise<TRecord[]> =>
      withTenantReadOnly(tenantId, async (client) => {
        const { rows } = await client.query(
          `SELECT ${selectCols} FROM ${table} ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
          [sanitizeLimit(limit), Math.max(0, Math.trunc(offset))],
        );
        return rows.map(mapRow);
      }),
    get: async (tenantId: string, id: string): Promise<TRecord | null> =>
      withTenantReadOnly(tenantId, async (client) => {
        const { rows } = await client.query(`SELECT ${selectCols} FROM ${table} WHERE id = $1`, [
          id,
        ]);
        return rows.length > 0 ? mapRow(rows[0]) : null;
      }),
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
      withTenant(tenantId, async (client) => {
        const { rows } = await client.query(
          `UPDATE ${table} SET ${updateSet} WHERE id = $1 RETURNING ${selectCols}`,
          [id, ...toUpdate(id, input)],
        );
        return rows.length > 0 ? mapRow(rows[0]) : null;
      }),
    delete: async (tenantId: string, id: string): Promise<boolean> =>
      withTenant(tenantId, async (client) => {
        const { rowCount } = await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
        return (rowCount ?? 0) > 0;
      }),
  };
}
