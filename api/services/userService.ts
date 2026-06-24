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
import { getPool } from '../db/index.js';
import { logger } from '../utils/logger.js';

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'analyst' | 'readonly';
  createdAt: Date;
  isActive: boolean;
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
): Promise<User> {
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,  // 64 MB
    timeCost: 3,        // 3 iterations
    parallelism: 1,     // 单线程
  });

  const pool = getPool();
  const { rows } = await pool.query(
    'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at, is_active',
    [username, passwordHash, role],
  );

  logger.info({ userId: rows[0].id, username, role }, '[userService] 用户创建成功');

  return {
    id: rows[0].id,
    username: rows[0].username,
    role: rows[0].role,
    createdAt: rows[0].created_at,
    isActive: rows[0].is_active,
  };
}

/**
 * 验证用户凭证
 *
 * 企业理由：argon2.verify 使用常量时间比较，防止时序攻击。
 * 验证失败不区分"用户不存在"和"密码错误"，防止用户名枚举。
 */
export async function verifyUser(
  username: string,
  password: string,
): Promise<User | null> {
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
  await pool.query(
    'UPDATE users SET last_login_at = NOW() WHERE id = $1',
    [user.id],
  );

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.created_at,
    isActive: user.is_active,
  };
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

  return {
    id: rows[0].id,
    username: rows[0].username,
    role: rows[0].role,
    createdAt: rows[0].created_at,
    isActive: rows[0].is_active,
  };
}
