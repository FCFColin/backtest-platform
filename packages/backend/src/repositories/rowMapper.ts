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

export function iso(v: unknown): string {
  return new Date(v as Date | string).toISOString();
}

export function toIso(v: unknown): string | null {
  return v ? iso(v) : null;
}
