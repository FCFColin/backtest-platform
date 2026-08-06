import argon2 from 'argon2';
import crypto from 'crypto';
import { getPool } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';
import { rowToUser, type User } from '../../repositories/userRepo.js';
import { sha256Hex } from '../../utils/crypto.js';

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// argon2.verify 常量时间比较防时序攻击；失败不区分“用户不存在”和“密码错误”防枚举。
export async function verifyUser(username: string, password: string): Promise<User | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, username, password_hash, role, created_at, is_active FROM users WHERE username = $1 AND is_active = true',
    [username],
  );

  if (rows.length === 0) {
    await argon2.hash('dummy-password', { type: argon2.argon2id });
    return null;
  }

  const user = rows[0];
  const isValid = await argon2.verify(user.password_hash, password);

  if (!isValid) {
    logger.warn({ username }, '[userService] 密码验证失败');
    return null;
  }

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  return rowToUser(user);
}

export async function issueEmailVerificationToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_MS);
  const pool = getPool();
  await pool.query(
    'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt],
  );
  return token;
}

export async function verifyEmailToken(token: string): Promise<string | null> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 256) return null;
  const tokenHash = sha256Hex(token);
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, user_id FROM email_verification_tokens
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
        FOR UPDATE`,
      [tokenHash],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const { id, user_id } = rows[0];
    await client.query('UPDATE email_verification_tokens SET consumed_at = NOW() WHERE id = $1', [
      id,
    ]);
    await client.query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [user_id]);
    await client.query('COMMIT');
    logger.info({ userId: user_id }, '[userService] 邮箱验证成功');
    return user_id;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err: String(err) }, '[userService] 邮箱验证失败');
    return null;
  } finally {
    client.release();
  }
}
