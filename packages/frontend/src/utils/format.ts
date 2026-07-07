export function fmtDate(d?: string): string {
  if (!d) return '—';
  return d;
}

export function fmtYears(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v.toFixed(2)}y`;
}

export function fmtPct(v: number | undefined | null, decimals = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(decimals)}%`;
}

export function fmtRatio(v: number | undefined | null): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(2);
}

export function fmtNum(v: number | undefined | null, decimals = 2): string {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(decimals);
}
