import i18n from '@/i18n/index.js';

export function fmtDate(d?: string): string {
  if (!d) return '—';
  return d;
}

/**
 * 格式化持续天数。规则：
 * - days < 1: "0天"
 * - days < 30: "X天"
 * - 30 ≤ days < 365: "X个月"
 * - days ≥ 365: "X年Y个月"
 * @param days - 持续天数
 * @returns 格式化后的字符串
 */
export function formatDuration(days: number | undefined | null): string {
  if (days == null || Number.isNaN(days)) return '—';
  const totalDays = Math.round(days);
  if (totalDays < 1) return i18n.t('format.durationZero');
  if (totalDays < 30) return i18n.t('format.durationDays', { count: totalDays });
  const months = Math.round(totalDays / 30);
  if (months < 12) return i18n.t('format.durationMonths', { count: months });
  const years = Math.floor(totalDays / 365);
  const remainingMonths = Math.round((totalDays % 365) / 30);
  if (remainingMonths === 0) return i18n.t('format.durationYears', { count: years });
  return i18n.t('format.durationYearsMonths', { years, months: remainingMonths });
}


/**
 * 格式化年数为人类可读字符串。规则：
 * - null/undefined/NaN: "—"
 * - <=0: "0天"
 * - >0: "X年Y个月"（不足 1 年仅显示月份）
 * @param years - 年数
 * @returns 格式化后的字符串
 */
export function fmtYears(years: number | undefined | null): string {
  if (years == null || Number.isNaN(years)) return '—';
  if (years <= 0) return i18n.t('format.durationZero');
  const wholeYears = Math.floor(years);
  const remainingMonths = Math.round((years - wholeYears) * 12);
  if (wholeYears === 0) return i18n.t('format.durationMonths', { count: remainingMonths });
  if (remainingMonths === 0) return i18n.t('format.durationYears', { count: wholeYears });
  return i18n.t('format.durationYearsMonths', { years: wholeYears, months: remainingMonths });
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
