/**
 * 日期校验工具
 *
 * Code Quality: 提取重复的日期校验逻辑为共享工具
 * 企业为何需要：日期校验逻辑散落各处时，修改校验规则需改多处，易遗漏
 * 权衡：集中管理可能过度抽象，但校验规则必须一致
 */

/** 校验日期格式（YYYY-MM-DD），空字符串视为合法（表示"全部历史"） */
export function isValidDate(value: string): boolean {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** 过滤日期范围，空字符串表示不限制 */
export function filterDates(dates: string[], startDate?: string, endDate?: string): string[] {
  const startLimit = startDate || '0000-01-01';
  const endLimit = endDate || '9999-12-31';
  return dates.filter((d) => d >= startLimit && d <= endLimit);
}

/** 获取日期范围的边界值，空字符串表示不限制 */
export function getDateLimits(
  startDate?: string,
  endDate?: string,
): { startLimit: string; endLimit: string } {
  return {
    startLimit: startDate || '0000-01-01',
    endLimit: endDate || '9999-12-31',
  };
}
