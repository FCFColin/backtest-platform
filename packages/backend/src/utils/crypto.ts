/**
 * 通用加密原语（项目内共享）
 *
 * 企业理由：API Key 哈希存储、邮箱验证令牌、邀请令牌均需 SHA-256 摘要，
 * 此前在 apiKeyVerifier / userService / apiKeyRepo / invitationRepo 各存副本。
 * 集中到本模块以消除重复并保证行为一致。
 */
import crypto from 'crypto';

/**
 * 计算字符串的 SHA-256 十六进制摘要。
 *
 * @param input - 待哈希的字符串（UTF-8 编码）
 * @returns 64 字符小写十六进制摘要
 */
export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}
