/**
 * 通用加密原语（项目内共享）
 *
 * 企业理由：API Key 哈希存储、邮箱验证令牌、邀请令牌均需 SHA-256 摘要，
 * 此前在 apiKeyVerifier / userService / apiKeyRepo / invitationRepo 各存副本。
 * 集中到本模块以消除重复并保证行为一致。
 */
import crypto from 'crypto';
import argon2 from 'argon2';

/**
 * 计算字符串的 SHA-256 十六进制摘要。
 *
 * @param input - 待哈希的字符串（UTF-8 编码）
 * @returns 64 字符小写十六进制摘要
 */
export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}

/**
 * 使用 argon2id 对高价值凭证（API Key）进行加盐哈希。
 *
 * 企业理由（P0-04）：API Key 此前仅存 sha256 等值。sha256 对高熵密钥虽无 brute-force 顾虑，
 * 但与密码哈希策略对齐（argon2id）可统一密钥派生与存储口径，满足等保三级"身份鉴别"
 * 对凭证存储的要求。argon2id 抗 GPU/ASIC，且 encoded hash 内含盐与参数，自描述可迁移。
 *
 * @param plaintext - 待哈希的明文密钥
 * @returns argon2id 编码哈希字符串（含盐与参数，可持久化）
 */
export async function hashApiKeyArgon2id(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, { type: argon2.argon2id });
}

/**
 * 用 argon2id 编码哈希校验明文密钥。
 *
 * @param encoded - argon2id 编码哈希（持久化存储值）
 * @param plaintext - 客户端提供的明文密钥
 * @returns 是否匹配；哈希格式损坏或校验异常时返回 false（不抛错，避免侧信道）
 */
export async function verifyApiKeyArgon2id(encoded: string, plaintext: string): Promise<boolean> {
  if (!encoded) return false;
  try {
    return await argon2.verify(encoded, plaintext);
  } catch {
    return false;
  }
}
