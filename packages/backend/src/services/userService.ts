/**
 * 用户服务模块
 *
 * 企业理由：共享 ADMIN_API_KEY 无法区分用户身份，不符合 SOC 2/ISO 27001 可追溯要求。
 * 用户表支持多用户注册、argon2id 密码哈希存储、角色分配。
 * argon2id 是 OWASP 推荐的密码哈希算法（抗 GPU/ASIC 破解），
 * 比 bcrypt 更安全（内存硬，抗并行攻击）。
 * 权衡：argon2 比 bcrypt 慢约 2x（验证约 100ms），但安全性更高。
 */
import argon2 from 'argon2';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../db/index.js';
import { logger } from '../utils/logger.js';

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'analyst' | 'readonly';
  createdAt: Date;
  isActive: boolean;
}

/** 邮箱验证令牌有效期（毫秒，24 小时） */
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    username: row.username as string,
    role: row.role as 'admin' | 'analyst' | 'readonly',
    createdAt: row.created_at as Date,
    isActive: row.is_active as boolean,
  };
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf-8').digest('hex');
}

/**
 * 计算 argon2id 密码哈希（OWASP 推荐参数）。
 *
 * @param password - 明文密码
 * @returns argon2id 哈希串
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

/**
 * 创建用户
 *
 * 企业理由：密码使用 argon2id 哈希存储，即使数据库泄露也无法逆向获取明文。
 * argon2id 是 Argon2 系列的推荐变体（兼顾抗侧信道和抗 GPU 破解）。
 */
export async function createUser(
  username: string,
  password: string,
  role: 'admin' | 'analyst' | 'readonly' = 'analyst',
  email?: string | null,
): Promise<User> {
  const passwordHash = await hashPassword(password);

  const pool = getPool();
  const { rows } = await pool.query(
    'INSERT INTO users (username, password_hash, role, email) VALUES ($1, $2, $3, $4) RETURNING id, username, role, created_at, is_active',
    [username, passwordHash, role, email ?? null],
  );

  logger.info(
    { userId: rows[0].id, username, role, hasEmail: !!email },
    '[userService] 用户创建成功',
  );

  return rowToUser(rows[0]);
}

/**
 * 在事务内创建用户（供注册流程与组织/成员一并落库，ADR-035）。
 *
 * @param client - 事务客户端
 * @param username - 用户名
 * @param password - 明文密码
 * @param email - 邮箱（可空）
 * @param role - 全局角色
 * @returns 新建用户
 */
export async function createUserTx(
  client: PoolClient,
  username: string,
  password: string,
  email: string | null,
  role: 'admin' | 'analyst' | 'readonly' = 'analyst',
): Promise<User> {
  const passwordHash = await hashPassword(password);
  const { rows } = await client.query(
    'INSERT INTO users (username, password_hash, role, email) VALUES ($1, $2, $3, $4) RETURNING id, username, role, created_at, is_active',
    [username, passwordHash, role, email],
  );
  return rowToUser(rows[0]);
}

/**
 * 按邮箱查找用户（大小写不敏感）。
 *
 * @param email - 邮箱
 * @returns 用户或 null
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, username, role, created_at, is_active FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

/**
 * 为用户签发一枚邮箱验证令牌（返回明文，仅用于邮件链接）。
 *
 * @param userId - 用户 UUID
 * @returns 明文令牌
 */
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

/**
 * 校验邮箱验证令牌：未过期且未消费时，标记用户 email_verified_at 并消费令牌。
 *
 * @param token - 明文令牌
 * @returns 验证成功返回 userId，否则 null
 */
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

/**
 * 验证用户凭证
 *
 * 企业理由：argon2.verify 使用常量时间比较，防止时序攻击。
 * 验证失败不区分"用户不存在"和"密码错误"，防止用户名枚举。
 */
export async function verifyUser(username: string, password: string): Promise<User | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, username, password_hash, role, created_at, is_active FROM users WHERE username = $1 AND is_active = true',
    [username],
  );

  if (rows.length === 0) {
    // 用户不存在，仍执行 argon2.hash 防止时序攻击
    await argon2.hash('dummy-password', { type: argon2.argon2id });
    return null;
  }

  const user = rows[0];
  const isValid = await argon2.verify(user.password_hash, password);

  if (!isValid) {
    logger.warn({ username }, '[userService] 密码验证失败');
    return null;
  }

  // 更新最后登录时间
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  return rowToUser(user);
}

/**
 * 根据 ID 获取用户
 */
export async function getUserById(id: string): Promise<User | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, username, role, created_at, is_active FROM users WHERE id = $1',
    [id],
  );

  if (rows.length === 0) return null;

  return rowToUser(rows[0]);
}

/**
 * 停用用户（软删除 / 可逆）。
 *
 * 企业为何需要（GDPR/PIPL 数据生命周期）：账户停用是"撤回访问"的常规操作，
 * 区别于不可逆的"被遗忘权"。保留行记录以满足审计/财务留存义务，仅阻断登录。
 *
 * @param id - 用户 ID
 * @returns 是否有记录被更新
 */
export async function deactivateUser(id: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true',
    [id],
  );
  logger.info({ userId: id, affected: rowCount }, '[userService] 用户已停用');
  return (rowCount ?? 0) > 0;
}

/**
 * 匿名化用户（GDPR Article 17 被遗忘权的"保留统计、抹除身份"实现）。
 *
 * 企业为何需要：直接物理删除会破坏审计/外键完整性（如审计日志引用 userId）。
 * 行业标准做法是"假名化/匿名化"——抹除 PII（用户名、密码哈希），保留不可关联到自然人的
 * 占位标识，使历史聚合统计仍然成立，同时满足 GDPR Art.17 与 PIPL §47 的删除义务。
 * 做法：用户名替换为 `deleted_<id前8位>`，密码哈希清空，停用账户。
 *
 * @param id - 用户 ID
 * @returns 是否有记录被匿名化
 */
export async function anonymizeUser(id: string): Promise<boolean> {
  const pool = getPool();
  const anonymizedUsername = `deleted_${id.replace(/-/g, '').substring(0, 8)}`;
  const { rowCount } = await pool.query(
    `UPDATE users
       SET username = $2,
           password_hash = '',
           is_active = false,
           updated_at = NOW()
     WHERE id = $1`,
    [id, anonymizedUsername],
  );
  logger.info({ userId: id, affected: rowCount }, '[userService] 用户已匿名化（GDPR Art.17）');
  return (rowCount ?? 0) > 0;
}

/**
 * 物理删除用户（硬删除）。
 *
 * 企业为何需要：当无审计留存义务、且监管要求彻底删除时使用。多数企业场景应优先
 * 使用 anonymizeUser（保留引用完整性）。物理删除前调用方须确保已解除外键依赖。
 *
 * @param id - 用户 ID
 * @returns 是否有记录被删除
 */
export async function deleteUser(id: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  logger.info({ userId: id, affected: rowCount }, '[userService] 用户已物理删除');
  return (rowCount ?? 0) > 0;
}
