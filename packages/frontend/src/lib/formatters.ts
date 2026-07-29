/**
 * @file formatters.ts
 * @description 统一格式化函数：货币/百分比/持续时间/数字/带符号百分比。
 *   所有函数均对 null/undefined/NaN 安全：传入非法值时返回 '—'（em-dash 占位符）。
 */

import i18n from '../i18n/index.js';

/** 非法值占位符（em-dash）。 */
const NULL_PLACEHOLDER = '—';

/**
 * 判断数值是否非法（null/undefined/NaN）。
 * @param value - 待检测值。
 * @returns 为非法值时 true。
 */
function isInvalidNumber(value: number | null | undefined): value is null | undefined {
  return value == null || Number.isNaN(value);
}

/**
 * 格式化货币值。大数（≥100万）0 小数，小数 2 位。
 * @param value - 数值，可为 null/undefined/NaN。
 * @param currency - 货币代码，默认 USD。
 * @returns 格式化后的货币字符串；非法值返回 '—'。
 */
export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'USD',
): string {
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

/**
 * 格式化货币值（无小数）。如 `$350,000`。
 * @param value - 数值，可为 null/undefined/NaN。
 * @param currency - 货币代码，默认 USD。
 * @returns 无小数的货币字符串；非法值返回 '—'。
 */
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

/**
 * 格式化百分比值。
 * 契约：所有输入均为小数比率（如 0.0918 = 9.18%），函数内部乘 100 后格式化。
 * @param value - 小数比率（如 0.0918 表示 9.18%），可为 null/undefined/NaN。
 * @param digits - 小数位数，默认 2。
 * @returns 格式化后的百分比字符串（如 "9.18%"）；非法值返回 '—'。
 */
export function formatPercent(
  value: number | null | undefined,
  digits: number = 2,
): string {
  if (isInvalidNumber(value)) return NULL_PLACEHOLDER;
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * 格式化带符号百分比（正数加 + 号）。
 * 契约：所有输入均为小数比率（如 -0.2278 = -22.78%），函数内部乘 100 后格式化。
 * @param value - 小数比率，可为 null/undefined/NaN。
 * @param digits - 小数位数，默认 2。
 * @returns 带符号的百分比字符串（如 "-22.78%"）；非法值返回 '—'。
 */
export function formatPercentSigned(
  value: number | null | undefined,
  digits: number = 2,
): string {
  if (isInvalidNumber(value)) return NULL_PLACEHOLDER;
  const percent = value * 100;
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(digits)}%`;
}

/**
 * 格式化持续天数：天/月/年。
 * @param days - 天数，可为 null/undefined/NaN。
 * @returns 格式化后的持续时间字符串；非法值返回 '—'。
 */
export function formatDuration(days: number | null | undefined): string {
  if (isInvalidNumber(days)) return NULL_PLACEHOLDER;
  if (days < 30) return i18n.t('format.durationDays', { count: days });
  if (days < 365) return i18n.t('format.durationMonthShort', { count: Math.round(days / 30) });
  const years = days / 365;
  return i18n.t('format.durationYearsShort', { count: years.toFixed(1) });
}

/**
 * 格式化数字。
 * @param value - 数值，可为 null/undefined/NaN。
 * @param digits - 小数位数，默认 2。
 * @returns 格式化后的数字字符串；非法值返回 '—'。
 */
export function formatNumber(
  value: number | null | undefined,
  digits: number = 2,
): string {
  if (isInvalidNumber(value)) return NULL_PLACEHOLDER;
  return value.toFixed(digits);
}

/**
 * 格式化整数。
 * @param value - 数值，可为 null/undefined/NaN。
 * @returns 整数字符串；非法值返回 '—'。
 */
export function formatInteger(value: number | null | undefined): string {
  if (isInvalidNumber(value)) return NULL_PLACEHOLDER;
  return Math.trunc(value).toString();
}
