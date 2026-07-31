/**
 * MFA/2FA 服务（P1-09 等保三级 8.1.4 身份鉴别）：RFC 6238 TOTP + RFC 4648 Base32，纯 Node crypto 实现。
 * 启用：生成 secret → otpauth:// URI（QR）→ 用户验证一次 → 入库；登录：密码通过后要求 TOTP 或备份码。
 * 安全：TOTP 容差 ±1 步（30s）防时钟漂移；备份码 argon2id 哈希存储、验证后立即删除（一次性）；secret 用 CSPRNG。
 */
import crypto from 'crypto';
import argon2 from 'argon2';
import { config } from '../../config/index.js';
import { getPool } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';

const TOTP_STEP_SEC = 30; // RFC 6238 默认时间步长
const TOTP_DIGITS = 6; // 码长（位数）
const TOTP_TOLERANCE_STEPS = 1; // ±N 步容差防时钟漂移

// Base32 编解码（RFC 4648）
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

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
  if (bits > 0) result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return result;
}

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

// TOTP 核心（RFC 6238）：HOTP(K, T) = Truncate(HMAC-SHA1(K, T)) mod 10^digits，T = floor(unix_time / step)
function hotp(secret: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter)); // 64 位大端整数
  const hmac = crypto.createHmac('sha1', secret).update(counterBuffer).digest();
  // Dynamic Truncation（RFC 4226 §5.3）
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % Math.pow(10, TOTP_DIGITS)).toString().padStart(TOTP_DIGITS, '0');
}

function currentStep(): number {
  return Math.floor(Date.now() / 1000 / TOTP_STEP_SEC);
}

/** 验证 TOTP 码（含 ±tolerance 步容差）。 */
export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  let secretBuffer: Buffer;
  try {
    secretBuffer = base32Decode(secret);
  } catch {
    return false;
  }
  const step = currentStep();
  for (let i = -TOTP_TOLERANCE_STEPS; i <= TOTP_TOLERANCE_STEPS; i++)
    if (hotp(secretBuffer, step + i) === token) return true;
  return false;
}

// MFA 生命周期管理

/** 生成 MFA 密钥与 otpauth:// URI（用于 QR 码展示）。secret 为 Base32 编码。 */
export function generateMfaSecret(username: string): { secret: string; otpauthUri: string } {
  const secret = base32Encode(crypto.randomBytes(20));
  const issuer = encodeURIComponent(config.MFA_ISSUER);
  const label = encodeURIComponent(`${config.MFA_ISSUER}:${username}`);
  const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SEC}`;
  return { secret, otpauthUri };
}

/** 启用 MFA：secret 入库并标记 mfa_enabled=true。调用前应先 verifyTotp 验证。 */
export async function enableMfa(userId: string, secret: string): Promise<void> {
  await getPool().query(
    'UPDATE users SET mfa_enabled = TRUE, mfa_secret = $1, updated_at = NOW() WHERE id = $2',
    [secret, userId],
  );
  logger.info({ userId }, '[mfaService] MFA 已启用');
}

/** 禁用 MFA：清除 secret 与备份码。 */
export async function disableMfa(userId: string): Promise<void> {
  await getPool().query(
    'UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_backup_codes = NULL, updated_at = NOW() WHERE id = $1',
    [userId],
  );
  logger.info({ userId }, '[mfaService] MFA 已禁用');
}

/** 生成备份码（明文返回一次，入库为 argon2id 哈希）。 */
export async function generateBackupCodes(): Promise<{ plaintext: string[]; hashes: string[] }> {
  const count = config.MFA_BACKUP_CODE_COUNT;
  const plaintext: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < count; i++) {
    // 8 bytes → base64url ~11 字符 → 截取 10 位确保固定长度
    const code = crypto.randomBytes(8).toString('base64url').slice(0, 10).toUpperCase();
    plaintext.push(code);
    hashes.push(await argon2.hash(code, { type: argon2.argon2id }));
  }
  return { plaintext, hashes };
}

/** 验证并消费一个备份码（一次性，验证后从数组移除）。 */
export async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const client = await getPool().connect();
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
    codes.splice(consumedIndex, 1); // 消费：从数组中移除已使用的备份码
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

/** 验证 MFA 码：6 位走 TOTP，10 位走备份码。 */
export async function verifyMfaCode(userId: string, code: string): Promise<boolean> {
  const { rows } = await getPool().query(
    'SELECT mfa_secret, mfa_backup_codes FROM users WHERE id = $1 AND mfa_enabled = TRUE',
    [userId],
  );
  if (rows.length === 0) return false;
  const { mfa_secret, mfa_backup_codes } = rows[0];
  if (/^\d{6}$/.test(code) && mfa_secret) return verifyTotp(mfa_secret, code);
  if (mfa_backup_codes && mfa_backup_codes.length > 0) return verifyBackupCode(userId, code);
  return false;
}
