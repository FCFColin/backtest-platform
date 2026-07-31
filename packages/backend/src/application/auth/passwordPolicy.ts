/**
 * 密码策略服务（P1-09 等保三级 8.1.4 身份鉴别）
 *
 * 等保三级密码要求：
 * - 长度 ≥ 12 位（比等保最低 8 位更严格）
 * - 复杂度：至少 3 类字符（大写/小写/数字/特殊）
 * - 禁止复用最近 5 次密码
 * - 密码过期（默认 90 天）
 *
 * 企业理由：弱密码是账户接管的首要入口。等保三级 8.1.4 a) 要求
 * "身份鉴别信息具有复杂度要求并定期更换"。本模块集中实现密码校验逻辑，
 * 供注册、改密、重置密码流程调用。
 */
import argon2 from 'argon2';
import { config } from '../../config/index.js';
import { getPool } from '../../db/pool.js';

interface PasswordValidationResult {
  valid: boolean;
  /** 失败原因列表（valid=false 时存在） */
  errors: string[];
}

interface CharClasses {
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
}

function detectCharClasses(password: string): CharClasses {
  return {
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

/**
 * 校验密码复杂度（长度 + 字符类别）。
 *
 * @param password - 明文密码
 * @returns 校验结果
 */
export function validatePasswordComplexity(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < config.PASSWORD_MIN_LENGTH) {
    errors.push(`密码长度不足，至少 ${config.PASSWORD_MIN_LENGTH} 位`);
  }

  const classes = detectCharClasses(password);
  const classCount = [classes.upper, classes.lower, classes.digit, classes.special].filter(
    Boolean,
  ).length;
  if (classCount < config.PASSWORD_REQUIRE_COMPLEXITY) {
    errors.push(
      `密码复杂度不足，需包含至少 ${config.PASSWORD_REQUIRE_COMPLEXITY} 类字符（大写/小写/数字/特殊）`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 检查密码是否在用户的历史密码中（禁止复用）。
 *
 * @param userId - 用户 UUID
 * @param password - 明文密码
 * @returns true=密码已被使用过（不可复用），false=可使用
 */
export async function isPasswordInHistory(userId: string, password: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    'SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY changed_at DESC LIMIT $2',
    [userId, config.PASSWORD_HISTORY_KEEP],
  );

  for (const row of rows) {
    try {
      if (await argon2.verify(row.password_hash, password)) {
        return true;
      }
    } catch {
      // 损坏的哈希跳过（不阻塞密码变更）
    }
  }
  return false;
}

/**
 * 完整密码校验：复杂度 + 历史复用检查。
 *
 * @param userId - 用户 UUID
 * @param password - 明文密码
 * @returns 校验结果
 */
export async function validatePassword(
  userId: string,
  password: string,
): Promise<PasswordValidationResult> {
  const complexityResult = validatePasswordComplexity(password);
  if (!complexityResult.valid) return complexityResult;

  if (await isPasswordInHistory(userId, password)) {
    return {
      valid: false,
      errors: [`密码与最近 ${config.PASSWORD_HISTORY_KEEP} 次使用过的密码重复`],
    };
  }

  return { valid: true, errors: [] };
}

/**
 * 记录密码到历史表（密码变更后调用）。
 * 同时清理超出保留数的历史记录。
 *
 * @param userId - 用户 UUID
 * @param passwordHash - argon2id 编码的密码哈希
 */
export async function recordPasswordHistory(userId: string, passwordHash: string): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)', [
      userId,
      passwordHash,
    ]);
    // 清理超出保留数的历史记录（仅保留最近 N 条）
    await client.query(
      `DELETE FROM password_history
       WHERE user_id = $1
         AND id NOT IN (
           SELECT id FROM password_history
           WHERE user_id = $1
           ORDER BY changed_at DESC
           LIMIT $2
         )`,
      [userId, config.PASSWORD_HISTORY_KEEP],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 检查用户密码是否已过期。
 *
 * @param userId - 用户 UUID
 * @returns true=密码已过期需更换
 */
export async function isPasswordExpired(userId: string): Promise<boolean> {
  const expireDays = config.PASSWORD_EXPIRE_DAYS;
  if (expireDays === 0) return false; // 0=不过期

  const pool = getPool();
  const { rows } = await pool.query('SELECT password_changed_at FROM users WHERE id = $1', [
    userId,
  ]);
  if (rows.length === 0) return false;

  const changedAt = new Date(rows[0].password_changed_at);
  const expireAt = new Date(changedAt.getTime() + expireDays * 24 * 60 * 60 * 1000);
  return expireAt < new Date();
}
