/**
 * Envelope Encryption 工具类（P1-06）+ Webhook secret 加密独立函数（C-024）
 *
 * 企业理由：敏感数据（API Key 明文、Stripe 密钥、Webhook 签名密钥等）需要在数据库中
 * 加密存储。即便数据库被拖库，攻击者也无法直接获取明文密钥伪造事件签名或调用外部 API。
 *
 * 本模块提供两套 API：
 * 1. EnvelopeEncryption 类（P1-06）：完整信封加密，每条数据独立 DEK，KEK 加密 DEK。
 *    适用于需要 KEK 轮换而不重加密全部数据的场景（如 API Key、Stripe 凭证）。
 * 2. 独立 encrypt/decrypt 函数（C-024）：直接用 KEK 做 AES-256-GCM，返回 Buffer 形式
 *    的 {ciphertext, iv, tag, kid}，映射到 webhook_endpoints 的 secret/secret_iv/secret_tag/
 *    secret_kid 列。Webhook secret 体积小、KEK 轮换低频，直接加密足以；kid 标识所用密钥
 *    版本，支持未来轮换时按 kid 选择旧密钥解密。
 *
 * 算法：AES-256-GCM（认证加密，防篡改）。KEK 经 sha256 派生为 32 字节密钥，故任意长度
 * 的 KEK 字符串均可使用；生产环境应通过 WEBHOOK_SECRET_KEK 注入高熵密钥。
 *
 * DB 层 pgcrypto 扩展由 021_webhooks.sql 创建（CREATE EXTENSION pgcrypto），提供
 * pgp_sym_encrypt/pgp_sym_decrypt 作为 DB 侧加解密能力；本模块的 Webhook secret 加解密
 * 在应用层（Node crypto）完成，DB 仅存储密文，避免明文经 SQL 日志/复制流泄露。
 */

import crypto from 'crypto';

/**
 * Envelope Encryption 加密结果（Base64 字符串形式，EnvelopeEncryption 类使用）。
 * @deprecated 优先使用独立 encrypt/decrypt 函数与新的 EncryptedPayload（Buffer 形式）。
 */
export interface EnvelopeEncryptedPayload {
  /** 加密的数据（Base64） */
  ciphertext: string;
  /** 加密的 DEK（Base64，含 kekIv + kekAuthTag + encryptedDek） */
  encryptedDek: string;
  /** GCM 初始化向量（Base64） */
  iv: string;
  /** GCM 认证标签（Base64） */
  authTag: string;
}

/**
 * Webhook secret 加密结果（Buffer 形式，映射到 webhook_endpoints 列）。
 *
 * - ciphertext → secret (bytea)
 * - iv → secret_iv (bytea)
 * - tag → secret_tag (bytea)
 * - kid → secret_kid (text)，标识加密所用 KEK 版本，支持轮换
 */
export interface EncryptedPayload {
  /** 加密数据（AES-256-GCM 密文） */
  ciphertext: Buffer;
  /** GCM 初始化向量（12 字节） */
  iv: Buffer;
  /** GCM 认证标签（16 字节） */
  tag: Buffer;
  /** 密钥标识（Key ID），用于 KEK 轮换时定位解密密钥 */
  kid: string;
}

/** KEK 算法标识 */
const KEK_ALGORITHM = 'aes-256-gcm';

/** 独立函数使用的 AES-256-GCM 算法（与 KEK_ALGORITHM 一致，单独常量便于阅读） */
const AES_GCM_ALGORITHM = 'aes-256-gcm';

/** GCM IV 长度（字节） */
const GCM_IV_LENGTH = 12;
/** GCM Auth Tag 长度（字节） */
const GCM_TAG_LENGTH = 16;

/** 默认开发环境 KEK（仅开发/测试用，生产必须通过 WEBHOOK_SECRET_KEK 覆盖） */
const DEFAULT_DEV_KEK = 'dev-webhook-kek-default-do-not-use-in-prod';

/** 默认密钥标识 */
const DEFAULT_KID = 'default';

/**
 * 解析 KEK 字符串与 kid。
 *
 * KEK 优先级：显式参数 > WEBHOOK_SECRET_KEK > ENCRYPTION_KEK > 默认开发 KEK。
 * 任意字符串经 sha256 派生为 32 字节密钥，避免长度校验负担；kid 来自 WEBHOOK_SECRET_KID
 * 或默认 'default'，用于多版本密钥并存时标识解密所用密钥。
 *
 * @param kek - 可选 KEK 字符串
 * @returns 派生的 32 字节密钥与 kid
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
 * 用于 Webhook 签名密钥在入库前加密（C-024）：webhookService.createWebhook 调用本函数，
 * 将密文/iv/tag/kid 写入 webhook_endpoints 对应列，DB 不接触明文。
 *
 * @param plaintext - 待加密的明文
 * @param kek - 可选 KEK 字符串（默认从环境变量读取）
 * @returns 加密结果（ciphertext/iv/tag 为 Buffer，kid 为字符串）
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
 * 用于 Webhook 投递前从 DB 读出密文并解密以计算 HMAC 签名（C-024）：
 * webhookService.processPendingDeliveries / webhookRoutes 测试端点调用本函数。
 * GCM 认证标签验证失败（密文被篡改或 KEK 不匹配）时抛错，防止用错误密钥伪造签名。
 *
 * @param payload - 加密结果（ciphertext/iv/tag 为 Buffer，kid 为字符串）
 * @param kek - 可选 KEK 字符串（默认从环境变量读取）
 * @returns 解密后的明文
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

/**
 * Envelope Encryption 工具类（完整信封加密，每条数据独立 DEK）。
 *
 * 使用方式：
 *   const enc = new EnvelopeEncryption(kekBase64);
 *   const encrypted = enc.encrypt('sensitive data');
 *   const decrypted = enc.decrypt(encrypted);
 *
 * @deprecated 新代码优先使用独立 encrypt/decrypt 函数；本类保留用于已存在的 P1-06 场景。
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
  encrypt(plaintext: string): EnvelopeEncryptedPayload {
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
  decrypt(payload: EnvelopeEncryptedPayload): string {
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
