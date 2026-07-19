/**
 * 日期校验工具
 *
 * Code Quality: 提取重复的日期校验逻辑为共享工具
 * 企业为何需要：日期校验逻辑散落各处时，修改校验规则需改多处，易遗漏
 * 权衡：集中管理可能过度抽象，但校验规则必须一致
 */

/** 将 Date 或 ISO 字符串转为 YYYY-MM-DD 字符串 */
export function toDateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return d.slice(0, 10);
}

/** 返回当前日期的 YYYY-MM-DD 字符串 */
export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 校验日期格式（YYYY-MM-DD），空字符串视为合法（表示"全部历史"） */
export function isValidDate(value: string): boolean {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
