/**
 * DB 行映射通用 helper（消除各 repository/route 重复的 snake_case → camelCase mapRow 样板）。
 *
 * 使用示例：
 *   const mapRow = rowMapper<ApiKeyRecord>({
 *     id: 'id',
 *     orgId: 'org_id',
 *     createdAt: (r) => iso(r.created_at),
 *     lastUsedAt: (r) => toIso(r.last_used_at),
 *   });
 *   rows.map(mapRow);
 */
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

/** 非空日期列 → ISO 字符串（如 created_at）。 */
export function iso(v: unknown): string {
  return new Date(v as Date | string).toISOString();
}

/** 可空日期列 → ISO 字符串或 null（如 last_used_at / accepted_at）。 */
export function toIso(v: unknown): string | null {
  return v ? iso(v) : null;
}
