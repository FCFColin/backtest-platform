/**
 * 用户仓储（CRUD）
 *
 * 企业理由：共享 ADMIN_API_KEY 无法区分用户身份，不符合 SOC 2/ISO 27001 可追溯要求。
 * 用户表支持多用户注册、argon2id 密码哈希存储、角色分配。
 * argon2id 是 OWASP 推荐的密码哈希算法（抗 GPU/ASIC 破解），
 * 比 bcrypt 更安全（内存硬，抗并行攻击）。
 * 权衡：argon2 比 bcrypt 慢约 2x（验证约 100ms），但安全性更高。
 *
 * 本仓储只承载 CRUD（无业务流程）；邮箱验证令牌与凭证校验等流程见
 * services/userService.ts。
 */
import argon2 from 'argon2';
import type { PoolClient } from 'pg';
import { getPool } from '../db/pool.js';
import { logger } from '../utils/logger.js';

/** 用户实体（应用层只读视图，不含 password_hash） */
export interface User {
  id: string;
  username: string;
  role: 'admin' | 'analyst' | 'readonly';
  createdAt: Date;
  isActive: boolean;
}

/**
 * 将数据库行映射为 User 实体。
 *
 * @param row - 数据库行（可包含额外字段如 password_hash，会被忽略）
 * @returns User 实体
 */
export function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    username: row.username as string,
    role: row.role as 'admin' | 'analyst' | 'readonly',
    createdAt: row.created_at as Date,
    isActive: row.is_active as boolean,
  };
}

/**
 * 计算 argon2id 密码哈希（OWASP 推荐参数）。
 *
 * @param password - 明文密码
 * @returns argon2id 哈希串
 */
async function hashPassword(password: string): Promise<string> {
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
 *
 * @param username - 用户名
 * @param password - 明文密码
 * @param role - 全局角色（默认 analyst）
 * @param email - 邮箱（可空）
 * @returns 新建用户
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
 * 根据 ID 获取用户
 *
 * @param id - 用户 UUID
 * @returns 用户或 null
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
 * 匿名化用户（GDPR Art.17 被遗忘权：抹除 PII，保留占位标识以维护外键完整性）。
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
