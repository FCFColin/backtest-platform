import i18n from '@/i18n/index.js';
import type { PortfolioResult } from '@backtest/shared';

const NULL = '—';

const invalid = (v: number | null | undefined): v is null | undefined =>
  v == null || Number.isNaN(v);

export function formatDuration(days: number | null | undefined): string {
  if (invalid(days)) return NULL;
  if (days < 30) return i18n.t('{{count}} days', { count: days });
  if (days < 365) return i18n.t('{{count}}mo', { count: Math.round(days / 30) });
  return i18n.t('{{count}}y', { count: (days / 365).toFixed(1) });
}

export const fmtPct = (v: number | undefined | null, decimals = 2): string =>
  v == null || Number.isNaN(v) ? NULL : `${(v * 100).toFixed(decimals)}%`;
export const fmtRatio = (v: number | undefined | null): string =>
  v == null || Number.isNaN(v) ? NULL : v.toFixed(2);
export const fmtNum = (v: number | undefined | null, decimals = 2): string =>
  v == null || Number.isNaN(v) ? NULL : v.toFixed(decimals);

export function formatPercentSigned(value: number | null | undefined, digits = 2): string {
  if (invalid(value)) return NULL;
  const pct = value * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(digits)}%`;
}

function fmtMoney(v: number, currency?: string): string {
  if (currency)
    return v.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 0 });
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export const fmtDollar = (v: number): string => fmtMoney(v);

export function formatCurrency(
  value: number | null | undefined,
  currency = 'USD',
  fixedDigits?: number,
): string {
  if (invalid(value)) return NULL;
  const maxFrac = fixedDigits ?? (Math.abs(value) >= 1_000_000 ? 0 : 2);
  return new Intl.NumberFormat(currency === 'CNY' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: maxFrac,
    maximumFractionDigits: maxFrac,
  }).format(value);
}

export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}

export const DOWNSAMPLE_THRESHOLD = 10000;
export const DOWNSAMPLE_TARGET = 1000;

export function downsample<T>(data: T[], maxPoints = DOWNSAMPLE_TARGET): T[] {
  if (data.length <= maxPoints) return data;
  const step = Math.ceil(data.length / maxPoints);
  const result: T[] = [];
  for (let i = 0; i < data.length; i += step) result.push(data[i]);
  if (result[result.length - 1] !== data[data.length - 1]) result.push(data[data.length - 1]!);
  return result;
}

export function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

export function mergePortfolioSeries<T, P extends Pick<PortfolioResult, 'name'>>(
  portfolios: P[],
  getSeries: (p: P) => T[] | undefined,
  getKey: (item: T) => string | number,
  getValue: (item: T) => number,
  keyName: 'date' | 'year' = 'date',
): Record<string, string | number>[] {
  if (portfolios.length === 0) return [];
  const map = new Map<string | number, Record<string, string | number>>();
  for (const p of portfolios) {
    for (const item of getSeries(p) ?? []) {
      const key = getKey(item);
      if (!map.has(key)) map.set(key, { [keyName]: key });
      map.get(key)![p.name] = getValue(item);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) =>
      typeof a[0] === 'number'
        ? (a[0] as number) - (b[0] as number)
        : String(a[0]).localeCompare(String(b[0])),
    )
    .map(([, value]) => value);
}

function toCSV(data: Array<Record<string, string | number | undefined | null>>): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const escapeCell = (val: string | number | undefined | null): string => {
    const str = String(val ?? '');
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };
  return [
    headers.join(','),
    ...data.map((row) => headers.map((h) => escapeCell(row[h])).join(',')),
  ].join('\n');
}

export function downloadFile(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function dateSuffixedFilename(base: string, ext: string): string {
  const now = new Date();
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${base}-${d}.${ext}`;
}

export function downloadCSV(
  data: Array<Record<string, string | number | undefined | null>>,
  base: string,
): void {
  const csv = toCSV(data);
  if (csv) downloadFile(csv, dateSuffixedFilename(base, 'csv'), 'text/csv;charset=utf-8;');
}

export function downloadJSON(data: unknown, filename: string): void {
  downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
}
