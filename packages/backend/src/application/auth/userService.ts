import argon2 from 'argon2';
import crypto from 'crypto';
import { getPool, withTransaction } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';
import { rowToUser, createUserTx, type User } from '../../repositories/userRepo.js';
import { sha256Hex } from '../../utils/crypto.js';

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'org'
  );
}

// ADR-009: 注册即创建个人组织，用户为 owner；冲突由调用方按唯一约束翻译为 409
export async function registerUser(
  username: string,
  password: string,
  email: string,
  orgName: string,
): Promise<string> {
  return withTransaction(async (client) => {
    const user = await createUserTx(client, username, password, email, 'analyst');
    const slug = `${slugify(orgName)}-${crypto.randomBytes(3).toString('hex')}`;
    const orgRes = await client.query(
      'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
      [orgName, slug],
    );
    const orgId = orgRes.rows[0].id as string;
    await client.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')", [
      orgId,
      user.id,
    ]);
    return user.id;
  });
}

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
  let isValid = false;
  try {
    isValid = await argon2.verify(user.password_hash, password);
  } catch {
    logger.warn({ username }, '[userService] 密码 hash 校验异常，按验证失败处理');
  }

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
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, user_id FROM email_verification_tokens
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > NOW()
        FOR UPDATE`,
        [tokenHash],
      );
      if (rows.length === 0) return null;
      const { id, user_id } = rows[0];
      await client.query('UPDATE email_verification_tokens SET consumed_at = NOW() WHERE id = $1', [
        id,
      ]);
      await client.query('UPDATE users SET email_verified_at = NOW() WHERE id = $1', [user_id]);
      logger.info({ userId: user_id }, '[userService] 邮箱验证成功');
      return user_id;
    });
  } catch (err) {
    logger.error({ err: String(err) }, '[userService] 邮箱验证失败');
    return null;
  }
}
