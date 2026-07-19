/**
 * 通用输入校验工具集
 */

/** UUID v4 正则表达式（大小写不敏感） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 检查字符串是否为有效 UUID（v4 形态）。
 *
 * 仅做形态校验，不验证版本位与变体位；用于在进入数据库前做防御性过滤，
 * 真正的隔离与完整性保证由 Postgres RLS / 参数化查询提供。
 * @param s - 待校验字符串
 * @returns 当 s 匹配 UUID v4 形态时为 true，否则为 false
 */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
