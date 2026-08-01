import i18n from '@/i18n/index.js';
import type { PortfolioResult } from '@backtest/shared';
const NULL_PLACEHOLDER = '—';
const MONTH_NAMES_SHORT = [
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
function isInvalidNumber(value: number | null | undefined): value is null | undefined {
  return value == null || Number.isNaN(value);
}
export function formatDuration(days: number | null | undefined): string {
  if (isInvalidNumber(days)) return NULL_PLACEHOLDER;
  if (days < 30) return i18n.t('format.durationDays', { count: days });
  if (days < 365) return i18n.t('format.durationMonthShort', { count: Math.round(days / 30) });
  const years = days / 365;
  return i18n.t('format.durationYearsShort', { count: years.toFixed(1) });
}
export function fmtYears(years: number | undefined | null): string {
  if (years == null || Number.isNaN(years)) return '—';
  if (years <= 0) return i18n.t('format.durationZero');
  const wholeYears = Math.floor(years);
  const remainingMonths = Math.round((years - wholeYears) * 12);
  if (wholeYears === 0) return i18n.t('format.durationMonths', { count: remainingMonths });
  if (remainingMonths === 0) return i18n.t('format.durationYears', { count: wholeYears });
  return i18n.t('format.durationYearsMonths', { years: wholeYears, months: remainingMonths });
}
export function fmtDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') return NULL_PLACEHOLDER;
  let year: number;
  let monthIndex: number;
  let day: number;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return NULL_PLACEHOLDER;
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
      ) {
        return NULL_PLACEHOLDER;
      }
    } else {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return NULL_PLACEHOLDER;
      year = parsed.getFullYear();
      monthIndex = parsed.getMonth();
      day = parsed.getDate();
    }
  }
  if (i18n.language === 'en') {
    return `${MONTH_NAMES_SHORT[monthIndex]} ${day}, ${year}`;
  }
  return `${year}年${monthIndex + 1}月${day}日`;
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
function fmtMoney(v: number, currency?: string): string {
  if (currency) {
    return v.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 0 });
  }
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
export function fmtDollar(v: number): string {
  return fmtMoney(v);
}
export function formatCurrency(value: number | null | undefined, currency: string = 'USD'): string {
  if (isInvalidNumber(value)) return NULL_PLACEHOLDER;
  if (Math.abs(value) >= 1_000_000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
export function formatCurrencyShort(
  value: number | null | undefined,
  currency: string = 'USD',
): string {
  if (isInvalidNumber(value)) return NULL_PLACEHOLDER;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}
export function formatPercent(value: number | null | undefined, digits: number = 2): string {
  if (isInvalidNumber(value)) return NULL_PLACEHOLDER;
  return `${(value * 100).toFixed(digits)}%`;
}
export function formatPercentSigned(value: number | null | undefined, digits: number = 2): string {
  if (isInvalidNumber(value)) return NULL_PLACEHOLDER;
  const percent = value * 100;
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(digits)}%`;
}
export function formatNumber(value: number | null | undefined, digits: number = 2): string {
  if (isInvalidNumber(value)) return NULL_PLACEHOLDER;
  return value.toFixed(digits);
}
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(sorted.length * p), sorted.length - 1)];
}
export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
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
      if (!map.has(key)) {
        map.set(key, { [keyName]: key });
      }
      map.get(key)![p.name] = getValue(item);
    }
  }
  const entries = Array.from(map.entries());
  entries.sort((a, b) =>
    typeof a[0] === 'number'
      ? (a[0] as number) - (b[0] as number)
      : String(a[0]).localeCompare(String(b[0])),
  );
  return entries.map(([, value]) => value);
}
