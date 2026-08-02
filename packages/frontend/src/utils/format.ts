import i18n from '@/i18n/index.js';
import type { PortfolioResult } from '@backtest/shared';

const NULL = '—';
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const invalid = (v: number | null | undefined): v is null | undefined =>
  v == null || Number.isNaN(v);

export function formatDuration(days: number | null | undefined): string {
  if (invalid(days)) return NULL;
  if (days < 30) return i18n.t('format.durationDays', { count: days });
  if (days < 365) return i18n.t('format.durationMonthShort', { count: Math.round(days / 30) });
  return i18n.t('format.durationYearsShort', { count: (days / 365).toFixed(1) });
}

export function fmtYears(years: number | undefined | null): string {
  if (years == null || Number.isNaN(years)) return NULL;
  if (years <= 0) return i18n.t('format.durationZero');
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  if (y === 0) return i18n.t('format.durationMonths', { count: m });
  return m === 0
    ? i18n.t('format.durationYears', { count: y })
    : i18n.t('format.durationYearsMonths', { years: y, months: m });
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return NULL;
  let year: number, monthIndex: number, day: number;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return NULL;
    year = value.getFullYear();
    monthIndex = value.getMonth();
    day = value.getDate();
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) {
      year = Number(match[1]);
      monthIndex = Number(match[2]) - 1;
      day = Number(match[3]);
      const verify = new Date(year, monthIndex, day);
      if (
        verify.getFullYear() !== year ||
        verify.getMonth() !== monthIndex ||
        verify.getDate() !== day
      )
        return NULL;
    } else {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return NULL;
      year = parsed.getFullYear();
      monthIndex = parsed.getMonth();
      day = parsed.getDate();
    }
  }
  return i18n.language === 'en'
    ? `${MONTHS[monthIndex]} ${day}, ${year}`
    : `${year}年${monthIndex + 1}月${day}日`;
}

export const fmtPct = (v: number | undefined | null, decimals = 2): string =>
  v == null || Number.isNaN(v) ? NULL : `${(v * 100).toFixed(decimals)}%`;
export const formatPercent = fmtPct;
export const fmtRatio = (v: number | undefined | null): string =>
  v == null || Number.isNaN(v) ? NULL : v.toFixed(2);
export const fmtNum = (v: number | undefined | null, decimals = 2): string =>
  v == null || Number.isNaN(v) ? NULL : v.toFixed(decimals);
export const formatNumber = fmtNum;

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

export function formatCurrency(value: number | null | undefined, currency = 'USD'): string {
  if (invalid(value)) return NULL;
  const maxFrac = Math.abs(value) >= 1_000_000 ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: maxFrac,
    maximumFractionDigits: maxFrac,
  }).format(value);
}

export function formatCurrencyShort(value: number | null | undefined, currency = 'USD'): string {
  if (invalid(value)) return NULL;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
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

export function toCSV(data: Array<Record<string, string | number | undefined | null>>): string {
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
