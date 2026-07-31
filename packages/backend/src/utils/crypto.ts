/**
 * 通用加密原语（项目内共享）+ Envelope Encryption 工具（P1-06/C-024）。
 *
 * 两部分：
 * 1. 哈希原语（sha256Hex / argon2id）：API Key 哈希存储、邮箱验证令牌、邀请令牌。
 * 2. 信封加密（EnvelopeEncryption / encrypt / decrypt）：AES-256-GCM，敏感数据落库加密。
 */
import crypto from 'crypto';
import argon2 from 'argon2';

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}

/**
 * 使用 argon2id 对高价值凭证（API Key）进行加盐哈希。
 *
 * @returns argon2id 编码哈希字符串（含盐与参数，可持久化）
 */
export async function hashApiKeyArgon2id(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, { type: argon2.argon2id });
}

/**
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

/** @deprecated 优先使用独立 encrypt/decrypt 函数与新的 EncryptedPayload（Buffer 形式）。 */
export interface EnvelopeEncryptedPayload {
  ciphertext: string;
  encryptedDek: string;
  iv: string;
  authTag: string;
}

/**
 * Webhook secret 加密结果（Buffer 形式，映射到 webhook_endpoints 列）。
 */
export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  /** 密钥标识（Key ID），用于 KEK 轮换时定位解密密钥 */
  kid: string;
}

const AES_GCM_ALGORITHM = 'aes-256-gcm';
const GCM_IV_LENGTH = 12;
const DEFAULT_DEV_KEK = 'dev-webhook-kek-default-do-not-use-in-prod';
const DEFAULT_KID = 'default';

/**
 * 解析 KEK 字符串与 kid。
 * KEK 优先级：显式参数 > WEBHOOK_SECRET_KEK > ENCRYPTION_KEK > 默认开发 KEK。
 */
function resolveKek(kek?: string): { key: Buffer; kid: string } {
  const kekStr =
    kek ?? process.env.WEBHOOK_SECRET_KEK ?? process.env.ENCRYPTION_KEK ?? DEFAULT_DEV_KEK;
  const key = crypto.createHash('sha256').update(kekStr, 'utf8').digest();
  const kid = process.env.WEBHOOK_SECRET_KID ?? DEFAULT_KID;
  return { key, kid };
}

/**
 * 加密明文（AES-256-GCM），返回 Buffer 形式的 {ciphertext, iv, tag, kid}。
 *
 * @param kek - 可选 KEK 字符串（默认从环境变量读取）
 */
export async function encrypt(plaintext: string, kek?: string): Promise<EncryptedPayload> {
  const { key, kid } = resolveKek(kek);
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_GCM_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag, kid };
}

/**
 * 解密 {ciphertext, iv, tag, kid} 还原明文。
 *
 * @param kek - 可选 KEK 字符串（默认从环境变量读取）
 * @throws 如果认证标签验证失败（数据被篡改或 KEK 不正确）
 */
export async function decrypt(payload: EncryptedPayload, kek?: string): Promise<string> {
  const { key } = resolveKek(kek);
  if (!Buffer.isBuffer(payload.ciphertext) || !Buffer.isBuffer(payload.iv) || !Buffer.isBuffer(payload.tag)) {
    throw new Error('decrypt 入参 ciphertext/iv/tag 必须为 Buffer');
  }
  const decipher = crypto.createDecipheriv(AES_GCM_ALGORITHM, key, payload.iv);
  decipher.setAuthTag(payload.tag);
  const plaintext = Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}