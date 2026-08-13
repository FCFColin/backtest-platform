import type pg from 'pg';

export function rowMapper<Out extends object>(spec: {
  [K in keyof Out]: string | ((row: Record<string, unknown>) => Out[K]);
}): (row: Record<string, unknown>) => Out {
  return (row) => {
    const out: Record<string, unknown> = {};
    for (const [key, src] of Object.entries(spec)) {
      out[key] = typeof src === 'function' ? src(row) : row[src as string];
    }
    return out as Out;
  };
}

type Queryable = Pick<pg.Pool, 'query'>;

// 统一非租户仓储常见的 query→rows→mapRow 样板
export async function queryRow<T>(
  db: Queryable,
  sql: string,
  params: unknown[],
  map: (row: Record<string, unknown>) => T,
): Promise<T | null> {
  const { rows } = await db.query(sql, params);
  return rows.length > 0 ? map(rows[0]) : null;
}

export async function queryMany<T>(
  db: Queryable,
  sql: string,
  params: unknown[],
  map: (row: Record<string, unknown>) => T,
): Promise<T[]> {
  const { rows } = await db.query(sql, params);
  return rows.map(map);
}

export function iso(v: unknown): string {
  return new Date(v as Date | string).toISOString();
}

export function toIso(v: unknown): string | null {
  return v ? iso(v) : null;
}
