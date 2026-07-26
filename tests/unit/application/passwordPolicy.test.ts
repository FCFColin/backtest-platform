/**
 * 密码策略服务单元测试（P1-09 等保三级 8.1.4）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const poolMocks = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn().mockResolvedValue(mockClient),
    query: vi.fn().mockResolvedValue({ rows: [] }),
  };
  return { mockClient, pool };
});

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: vi.fn(() => poolMocks.pool),
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: {
    PASSWORD_MIN_LENGTH: 12,
    PASSWORD_REQUIRE_COMPLEXITY: 3,
    PASSWORD_HISTORY_KEEP: 5,
    PASSWORD_EXPIRE_DAYS: 90,
  },
}));

import {
  validatePasswordComplexity,
  isPasswordInHistory,
  validatePassword,
  recordPasswordHistory,
  isPasswordExpired,
} from '../../../packages/backend/src/application/auth/passwordPolicy.js';

describe('passwordPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolMocks.mockClient.query.mockResolvedValue({ rows: [] });
    poolMocks.pool.query.mockResolvedValue({ rows: [] });
  });

  describe('validatePasswordComplexity', () => {
    it('应拒绝短密码', () => {
      const result = validatePasswordComplexity('Short1!');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('密码长度不足');
    });

    it('应拒绝缺少字符类别的密码', () => {
      const result = validatePasswordComplexity('alllowercase1234');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('复杂度不足');
    });

    it('应接受满足复杂度要求的密码', () => {
      const result = validatePasswordComplexity('Str0ng!Password');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应接受 4 类字符的密码', () => {
      const result = validatePasswordComplexity('Abcdef1!2345');
      expect(result.valid).toBe(true);
    });

    it('应接受仅 3 类字符的密码（默认阈值）', () => {
      const result = validatePasswordComplexity('Abcdefghijk1');
      expect(result.valid).toBe(true);
    });

    it('应拒绝仅 2 类字符的密码', () => {
      const result = validatePasswordComplexity('abcdefghijkl');
      expect(result.valid).toBe(false);
    });
  });

  describe('isPasswordInHistory', () => {
    it('无历史记录时应返回 false', async () => {
      poolMocks.pool.query.mockResolvedValue({ rows: [] });
      const result = await isPasswordInHistory('user-uuid', 'anypassword');
      expect(result).toBe(false);
    });

    it('匹配历史密码时应返回 true', async () => {
      // argon2id 哈希一个已知密码
      const argon2 = (await import('argon2')).default;
      const hash = await argon2.hash('OldPassword1!', { type: argon2.argon2id });
      poolMocks.pool.query.mockResolvedValue({ rows: [{ password_hash: hash }] });
      const result = await isPasswordInHistory('user-uuid', 'OldPassword1!');
      expect(result).toBe(true);
    });

    it('不匹配历史密码时应返回 false', async () => {
      const argon2 = (await import('argon2')).default;
      const hash = await argon2.hash('OldPassword1!', { type: argon2.argon2id });
      poolMocks.pool.query.mockResolvedValue({ rows: [{ password_hash: hash }] });
      const result = await isPasswordInHistory('user-uuid', 'DifferentPassword2!');
      expect(result).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('复杂度不足时应直接返回（不查 DB）', async () => {
      const result = await validatePassword('user-uuid', 'short');
      expect(result.valid).toBe(false);
      expect(poolMocks.pool.query).not.toHaveBeenCalled();
    });

    it('复杂度通过且无历史复用时应返回 valid', async () => {
      poolMocks.pool.query.mockResolvedValue({ rows: [] });
      const result = await validatePassword('user-uuid', 'Str0ng!Password');
      expect(result.valid).toBe(true);
    });

    it('复杂度通过但与历史重复时应返回 invalid', async () => {
      const argon2 = (await import('argon2')).default;
      const hash = await argon2.hash('Str0ng!Password', { type: argon2.argon2id });
      poolMocks.pool.query.mockResolvedValue({ rows: [{ password_hash: hash }] });
      const result = await validatePassword('user-uuid', 'Str0ng!Password');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('重复');
    });
  });

  describe('recordPasswordHistory', () => {
    it('应在事务中插入历史记录并清理旧记录', async () => {
      poolMocks.mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // DELETE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      await recordPasswordHistory('user-uuid', '$argon2id$hash');
      expect(poolMocks.mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(poolMocks.mockClient.query).toHaveBeenCalledWith(
        'INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)',
        ['user-uuid', '$argon2id$hash'],
      );
      expect(poolMocks.mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('插入失败应 ROLLBACK', async () => {
      poolMocks.mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('DB error')); // INSERT fails
      poolMocks.mockClient.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      await expect(recordPasswordHistory('user-uuid', 'hash')).rejects.toThrow('DB error');
      expect(poolMocks.mockClient.query).toHaveBeenLastCalledWith('ROLLBACK');
    });
  });

  describe('isPasswordExpired', () => {
    it('密码未过期时应返回 false', async () => {
      poolMocks.pool.query.mockResolvedValue({
        rows: [{ password_changed_at: new Date().toISOString() }],
      });
      const result = await isPasswordExpired('user-uuid');
      expect(result).toBe(false);
    });

    it('密码已过期时应返回 true', async () => {
      const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
      poolMocks.pool.query.mockResolvedValue({
        rows: [{ password_changed_at: ninetyOneDaysAgo }],
      });
      const result = await isPasswordExpired('user-uuid');
      expect(result).toBe(true);
    });

    it('用户不存在时应返回 false', async () => {
      poolMocks.pool.query.mockResolvedValue({ rows: [] });
      const result = await isPasswordExpired('nonexistent');
      expect(result).toBe(false);
    });
  });
});
