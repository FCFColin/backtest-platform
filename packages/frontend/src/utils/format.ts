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

/**
 * Format a number as a money string with optional currency code.
 * @param v - The numeric value to format
 * @param currency - Optional ISO 4217 currency code (e.g. 'USD', 'EUR'); defaults to USD with $ prefix
 * @returns Formatted money string
 */
function fmtMoney(v: number, currency?: string): string {
  if (currency) {
    return v.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 0 });
  }
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Format a number as USD dollars (no cents).
 * @param v - The numeric value to format
 * @returns Formatted dollar string like "$1,234"
 */
export function fmtDollar(v: number): string {
  return fmtMoney(v);
}
