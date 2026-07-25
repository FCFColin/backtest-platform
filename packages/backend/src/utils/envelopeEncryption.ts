/**
 * Envelope Encryption 工具类（P1-06）
 *
 * 企业理由：敏感数据（API Key 明文、Stripe 密钥等）需要在数据库中加密存储。
 * Envelope Encryption 模式：
 * 1. 每条数据生成唯一的 Data Encryption Key (DEK)
 * 2. 用 DEK 加密数据
 * 3. 用 Master Key (KEK) 加密 DEK
 * 4. 存储：加密数据 + 加密 DEK
 *
 * 优势：
 * - 轮换 KEK 不需要重新加密所有数据（只需重新加密 DEK）
 * - 每条数据有独立 DEK，单条泄露不影响其他
 * - KEK 可通过环境变量配置（开发）或 KMS（生产）
 *
 * 算法：AES-256-GCM（认证加密，防止篡改）
 *
 * 存储格式：
 * - encryptedDek = kekIv(12) + kekAuthTag(16) + encryptedDekBytes (Base64)
 * - ciphertext = 加密数据 (Base64)
 * - iv = 数据加密 IV (Base64)
 * - authTag = 数据加密 authTag (Base64)
 */

import crypto from 'crypto';

/** 加密结果（存储到数据库） */
export interface EncryptedPayload {
  /** 加密的数据（Base64） */
  ciphertext: string;
  /** 加密的 DEK（Base64，含 kekIv + kekAuthTag + encryptedDek） */
  encryptedDek: string;
  /** GCM 初始化向量（Base64） */
  iv: string;
  /** GCM 认证标签（Base64） */
  authTag: string;
}

/** KEK 算法标识 */
const KEK_ALGORITHM = 'aes-256-gcm';

/** GCM IV 长度（字节） */
const GCM_IV_LENGTH = 12;
/** GCM Auth Tag 长度（字节） */
const GCM_TAG_LENGTH = 16;

/**
 * Envelope Encryption 工具类。
 *
 * 使用方式：
 *   const enc = new EnvelopeEncryption(kekBase64);
 *   const encrypted = enc.encrypt('sensitive data');
 *   const decrypted = enc.decrypt(encrypted);
 */
export class EnvelopeEncryption {
  private kek: Buffer;

  /**
   * @param kekBase64 - Base64 编码的 256 位 Master Key (KEK)
   * @throws 如果 KEK 长度不是 32 字节（256 位）
   */
  constructor(kekBase64: string) {
    this.kek = Buffer.from(kekBase64, 'base64');
    if (this.kek.length !== 32) {
      throw new Error(`KEK must be 32 bytes (256 bits), got ${this.kek.length} bytes`);
    }
  }

  /**
   * 加密数据（envelope encryption 模式）。
   *
   * @param plaintext - 待加密的明文
   * @returns 加密结果（含 ciphertext, encryptedDek, iv, authTag）
   */
  encrypt(plaintext: string): EncryptedPayload {
    // 1. 生成随机 DEK（256 位）
    const dek = crypto.randomBytes(32);

    // 2. 生成数据加密 IV
    const iv = crypto.randomBytes(GCM_IV_LENGTH);

    // 3. 用 DEK 加密数据（AES-256-GCM）
    const cipher = crypto.createCipheriv(KEK_ALGORITHM, dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // 4. 用 KEK 加密 DEK（AES-256-GCM）
    const kekIv = crypto.randomBytes(GCM_IV_LENGTH);
    const kekCipher = crypto.createCipheriv(KEK_ALGORITHM, this.kek, kekIv);
    const encryptedDekBytes = Buffer.concat([kekCipher.update(dek), kekCipher.final()]);
    const kekAuthTag = kekCipher.getAuthTag();

    // 5. 拼接 kekIv + kekAuthTag + encryptedDekBytes → Base64
    const encryptedDek = Buffer.concat([kekIv, kekAuthTag, encryptedDekBytes]).toString('base64');

    return {
      ciphertext: ciphertext.toString('base64'),
      encryptedDek,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  /**
   * 解密数据。
   *
   * @param payload - 加密结果（含 ciphertext, encryptedDek, iv, authTag）
   * @returns 解密后的明文
   * @throws 如果认证标签验证失败（数据被篡改）或 KEK 不正确
   */
  decrypt(payload: EncryptedPayload): string {
    const iv = Buffer.from(payload.iv, 'base64');
    const authTag = Buffer.from(payload.authTag, 'base64');
    const ciphertext = Buffer.from(payload.ciphertext, 'base64');

    // 1. 从 encryptedDek 中提取 kekIv + kekAuthTag + encryptedDekBytes
    const dekBlob = Buffer.from(payload.encryptedDek, 'base64');
    const kekIv = dekBlob.subarray(0, GCM_IV_LENGTH);
    const kekAuthTag = dekBlob.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_TAG_LENGTH);
    const encryptedDekBytes = dekBlob.subarray(GCM_IV_LENGTH + GCM_TAG_LENGTH);

    // 2. 用 KEK 解密 DEK
    const kekDecipher = crypto.createDecipheriv(KEK_ALGORITHM, this.kek, kekIv);
    kekDecipher.setAuthTag(kekAuthTag);
    const dek = Buffer.concat([kekDecipher.update(encryptedDekBytes), kekDecipher.final()]);

    // 3. 用 DEK 解密数据
    const decipher = crypto.createDecipheriv(KEK_ALGORITHM, dek, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return plaintext.toString('utf8');
  }

  /**
   * 生成随机 KEK（用于初始化或轮换）。
   *
   * @returns Base64 编码的 256 位 KEK
   */
  static generateKek(): string {
    return crypto.randomBytes(32).toString('base64');
  }
}
