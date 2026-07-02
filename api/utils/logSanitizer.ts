/**
 * 日志脱敏工具
 *
 * Code Quality: 提取重复的日志脱敏逻辑为共享工具
 * 企业为何需要：日志脱敏逻辑散落各处时，修改脱敏规则需改多处，易遗漏
 * 权衡：集中管理可能过度抽象，但脱敏规则必须一致
 */

/** 敏感数据正则模式列表（用于日志脱敏） */
const SENSITIVE_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  {
    pattern: /(api[_-]?key|apikey|token|secret|password|auth|credential)[=:]\s*['"]?\S+['"]?/gi,
    replacement: '$1=***',
  },
  {
    pattern: /(Authorization|X-Engine-Auth|X-Data-Service-Auth|X-Api-Key):\s*\S+/gi,
    replacement: '$1: ***',
  },
  { pattern: /\b(?=[0-9a-fA-F]*[0-9])[0-9a-fA-F]{32,}\b/g, replacement: '***' },
  {
    pattern: /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
    replacement: '***',
  },
];

/**
 * 净化用户输入用于日志：移除换行符、脱敏敏感数据、截断到指定长度。
 *
 * @param s - 原始字符串
 * @param maxLen - 最大长度（默认 200）
 * @returns 脱敏后的安全日志字符串
 */
export function sanitizeLog(s: string, maxLen = 50): string {
  let result = s.replace(/[\n\r]/g, '');
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.substring(0, maxLen);
}
