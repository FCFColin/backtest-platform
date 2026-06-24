/**
 * 日志脱敏工具
 *
 * Code Quality: 提取重复的日志脱敏逻辑为共享工具
 * 企业为何需要：日志脱敏逻辑散落各处时，修改脱敏规则需改多处，易遗漏
 * 权衡：集中管理可能过度抽象，但脱敏规则必须一致
 */

/** 净化用户输入用于日志：移除换行符并截断到 50 字符 */
export function sanitizeLog(s: string): string {
  return s.replace(/[\n\r]/g, '').substring(0, 50);
}
