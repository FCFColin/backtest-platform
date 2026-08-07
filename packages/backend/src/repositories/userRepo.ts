import argon2 from 'argon2';
import type { PoolClient } from 'pg';
import { getPool } from '../db/pool.js';
import { logger } from '../utils/logger.js';
import { rowMapper } from './rowMapper.js';

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'analyst' | 'readonly';
  createdAt: Date;
  isActive: boolean;
}

export const rowToUser = rowMapper<User>({
  id: 'id',
  username: 'username',
  role: (r) => r.role as User['role'],
  createdAt: (r) => r.created_at as Date,
  isActive: 'is_active',
});

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

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

export async function getUserByEmail(email: string): Promise<User | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, username, role, created_at, is_active FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

export async function getUserById(id: string): Promise<User | null> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT id, username, role, created_at, is_active FROM users WHERE id = $1',
    [id],
  );

  if (rows.length === 0) return null;

  return rowToUser(rows[0]);
}

export async function deactivateUser(id: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true',
    [id],
  );
  logger.info({ userId: id, affected: rowCount }, '[userService] 用户已停用');
  return (rowCount ?? 0) > 0;
}

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

export async function deleteUser(id: string): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
  logger.info({ userId: id, affected: rowCount }, '[userService] 用户已物理删除');
  return (rowCount ?? 0) > 0;
}
