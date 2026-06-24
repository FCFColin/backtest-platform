/**
 * 日期过滤工具函数
 * 提取自 portfolio.ts 和 monteCarlo.ts 中重复的日期过滤逻辑
 */

/** 过滤日期范围，空字符串表示不限制 */
export function filterDates(dates: string[], startDate?: string, endDate?: string): string[] {
  const startLimit = startDate || '0000-01-01';
  const endLimit = endDate || '9999-12-31';
  return dates.filter(d => d >= startLimit && d <= endLimit);
}

/** 获取日期范围的边界值，空字符串表示不限制 */
export function getDateLimits(startDate?: string, endDate?: string): { startLimit: string; endLimit: string } {
  return {
    startLimit: startDate || '0000-01-01',
    endLimit: endDate || '9999-12-31',
  };
}
