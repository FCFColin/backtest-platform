/**
 * MFA/2FA 服务（P1-09 等保三级 8.1.4 身份鉴别）
 *
 * 实现 RFC 6238 TOTP（Time-based One-Time Password）与 RFC 4648 Base32，
 * 纯 Node crypto 实现，不引入外部依赖（speakeasy/otplib）。
 *
 * 流程：
 * - 启用 MFA：生成 secret → 展示 otpauth:// URI（QR 码）→ 用户验证一次 → 入库
 * - 登录：密码验证通过后，若 mfa_enabled=true，要求 TOTP 码或备份码
 * - 备份码：argon2id 哈希存储，一次性消费（验证后从数组移除）
 *
 * 安全考量：
 * - TOTP 容差 ±1 步（30s），防止时钟漂移导致误拒
 * - 备份码使用 argon2id 哈希（非明文），验证后立即删除
 * - secret 生成使用 crypto.randomBytes（CSPRNG）
 */
import crypto from 'crypto';
import argon2 from 'argon2';
import { config } from '../../config/index.js';
import { getPool } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';

/** TOTP 时间步长（秒，RFC 6238 默认 30s） */
const TOTP_STEP_SEC = 30;
/** TOTP 码长度（位数，RFC 6238 默认 6 位） */
const TOTP_DIGITS = 6;
/** TOTP 容差步数（±N 步，防止时钟漂移） */
const TOTP_TOLERANCE_STEPS = 1;

// Base32 编解码（RFC 4648）

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** 将 Buffer 编码为 Base32 字符串（RFC 4648） */
function base32Encode(buffer: Buffer): string {
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return result;
}

/** 将 Base32 字符串解码为 Buffer（RFC 4648） */
function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`非法 Base32 字符: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// TOTP 核心（RFC 6238）

/**
 * 计算给定时间步的 TOTP 值。
 *
 * HOTP(K, T) = Truncate(HMAC-SHA1(K, T)) mod 10^digits
 * T = floor(unix_time / step)
 */
function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  // counter 为 64 位大端整数
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest();
  // Dynamic Truncation（RFC 4226 §5.3）
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const otp = binary % Math.pow(10, TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

function currentStep(): number {
  return Math.floor(Date.now() / 1000 / TOTP_STEP_SEC);
}

/**
 * 验证 TOTP 码（含 ±tolerance 步容差）。
 *
 * @param secret - Base32 编码的 TOTP 密钥
 * @param token - 用户输入的 6 位码
 * @returns 是否匹配
 */
export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  let secretBuffer: Buffer;
  try {
    secretBuffer = base32Decode(secret);
  } catch {
    return false;
  }
  const step = currentStep();
  for (let i = -TOTP_TOLERANCE_STEPS; i <= TOTP_TOLERANCE_STEPS; i++) {
    if (hotp(secretBuffer, step + i) === token) return true;
  }
  return false;
}

// MFA 生命周期管理

/**
 * 生成 MFA 密钥与 otpauth:// URI（用于 QR 码展示）。
 *
 * @param username - 用户名（用于 otpauth label）
 * @returns { secret, otpauthUri } — secret 为 Base32 编码
 */
export function generateMfaSecret(username: string): {
  secret: string;
  otpauthUri: string;
} {
  const secretBytes = crypto.randomBytes(20);
  const secret = base32Encode(secretBytes);
  const issuer = encodeURIComponent(config.MFA_ISSUER);
  const label = encodeURIComponent(`${config.MFA_ISSUER}:${username}`);
  const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SEC}`;
  return { secret, otpauthUri };
}

/**
 * 启用 MFA：将 secret 入库并标记 mfa_enabled=true。
 * 调用前应先调用 verifyTotp 验证用户能正确生成 TOTP 码。
 *
 * @param userId - 用户 UUID
 * @param secret - Base32 编码的 TOTP 密钥
 */
export async function enableMfa(userId: string, secret: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    'UPDATE users SET mfa_enabled = TRUE, mfa_secret = $1, updated_at = NOW() WHERE id = $2',
    [secret, userId],
  );
  logger.info({ userId }, '[mfaService] MFA 已启用');
}

/**
 * 禁用 MFA：清除 secret 与备份码。
 *
 * @param userId - 用户 UUID
 */
export async function disableMfa(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    'UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_backup_codes = NULL, updated_at = NOW() WHERE id = $1',
    [userId],
  );
  logger.info({ userId }, '[mfaService] MFA 已禁用');
}

/**
 * 生成备份码（明文返回一次，入库为 argon2id 哈希）。
 *
 * @returns { plaintext: string[], hashes: string[] }
 */
export async function generateBackupCodes(): Promise<{
  plaintext: string[];
  hashes: string[];
}> {
  const count = config.MFA_BACKUP_CODE_COUNT;
  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 8 bytes → ~11 base64url 字符 → 截取 10 位确保固定长度
    const code = crypto.randomBytes(8).toString('base64url').slice(0, 10).toUpperCase();
    plaintext.push(code);
    hashes.push(await argon2.hash(code, { type: argon2.argon2id }));
  }
  return { plaintext, hashes };
}

/**
 * 保存备份码哈希到用户记录。
 *
 * @param userId - 用户 UUID
 * @param hashes - argon2id 哈希数组
 */
export async function saveBackupCodes(userId: string, hashes: string[]): Promise<void> {
  const pool = getPool();
  await pool.query('UPDATE users SET mfa_backup_codes = $1 WHERE id = $2', [hashes, userId]);
}

/**
 * 验证并消费一个备份码（一次性，验证后从数组移除）。
 *
 * @param userId - 用户 UUID
 * @param code - 用户输入的备份码
 * @returns 是否验证成功
 */
export async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT mfa_backup_codes FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    if (rows.length === 0 || !rows[0].mfa_backup_codes) {
      await client.query('ROLLBACK');
      return false;
    }
    const codes: string[] = rows[0].mfa_backup_codes;
    let consumedIndex = -1;
    for (let i = 0; i < codes.length; i++) {
      if (await argon2.verify(codes[i], code)) {
        consumedIndex = i;
        break;
      }
    }
    if (consumedIndex === -1) {
      await client.query('ROLLBACK');
      return false;
    }
    // 消费：从数组中移除已使用的备份码
    codes.splice(consumedIndex, 1);
    await client.query('UPDATE users SET mfa_backup_codes = $1 WHERE id = $2', [codes, userId]);
    await client.query('COMMIT');
    logger.info({ userId }, '[mfaService] 备份码已消费，剩余', { remaining: codes.length });
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err: String(err), userId }, '[mfaService] 备份码验证失败');
    return false;
  } finally {
    client.release();
  }
}

/**
 * 验证 MFA 码（优先 TOTP，失败后尝试备份码）。
 *
 * @param userId - 用户 UUID
 * @param code - 用户输入的 6 位 TOTP 或 10 位备份码
 * @returns 是否验证成功
 */
export async function verifyMfaCode(userId: string, code: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT mfa_secret, mfa_backup_codes FROM users WHERE id = $1 AND mfa_enabled = TRUE',
    [userId],
  );
  if (rows.length === 0) return false;

  const { mfa_secret, mfa_backup_codes } = rows[0];

  // 6 位 → TOTP
  if (/^\d{6}$/.test(code) && mfa_secret) {
    return verifyTotp(mfa_secret, code);
  }

  // 10 位 → 备份码
  if (mfa_backup_codes && mfa_backup_codes.length > 0) {
    return verifyBackupCode(userId, code);
  }

  return false;
}