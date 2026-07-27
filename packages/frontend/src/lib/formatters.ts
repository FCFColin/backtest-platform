/**
 * @file formatters.ts
 * @description 统一格式化函数：货币/百分比/持续时间/数字/带符号百分比。
 */

/**
 * 格式化货币值。大数（≥100万）0 小数，小数 2 位。
 * @param value - 数值。
 * @param currency - 货币代码，默认 USD。
 * @returns 格式化后的货币字符串。
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
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
 * 格式化百分比值。
 * @param value - 数值（如 12.34 表示 12.34%）。
 * @param digits - 小数位数，默认 2。
 * @returns 格式化后的百分比字符串。
 */
export function formatPercent(value: number, digits: number = 2): string {
  return `${value.toFixed(digits)}%`;
}

/**
 * 格式化持续天数：天/月/年。
 * @param days - 天数。
 * @returns 格式化后的持续时间字符串。
 */
export function formatDuration(days: number): string {
  if (days < 30) return `${days}天`;
  if (days < 365) return `${Math.round(days / 30)}月`;
  const years = days / 365;
  return `${years.toFixed(1)}年`;
}

/**
 * 格式化数字。
 * @param value - 数值。
 * @param digits - 小数位数，默认 2。
 * @returns 格式化后的数字字符串。
 */
export function formatNumber(value: number, digits: number = 2): string {
  return value.toFixed(digits);
}

/**
 * 格式化带符号百分比（正数加 + 号）。
 * @param value - 数值。
 * @param digits - 小数位数，默认 2。
 * @returns 带符号的百分比字符串。
 */
export function formatPercentSigned(value: number, digits: number = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}
