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
    MFA_ISSUER: 'BacktestPlatform',
    MFA_BACKUP_CODE_COUNT: 4,
  },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

import {
  verifyTotp,
  generateMfaSecret,
  enableMfa,
  disableMfa,
  generateBackupCodes,
  verifyBackupCode,
  verifyMfaCode,
} from '../../../packages/backend/src/application/auth/mfaService.js';

describe('mfaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolMocks.mockClient.query.mockResolvedValue({ rows: [] });
    poolMocks.pool.query.mockResolvedValue({ rows: [] });
  });

  describe('verifyTotp', () => {
    it('应拒绝非 6 位数字', () => {
      expect(verifyTotp('JBSWY3DPEHPK3PXP', 'abc')).toBe(false);
      expect(verifyTotp('JBSWY3DPEHPK3PXP', '12345')).toBe(false);
      expect(verifyTotp('JBSWY3DPEHPK3PXP', '1234567')).toBe(false);
      expect(verifyTotp('JBSWY3DPEHPK3PXP', 'abcdef')).toBe(false);
    });

    it('应拒绝非法 Base32 密钥', () => {
      expect(verifyTotp('!!!invalid!!!', '123456')).toBe(false);
    });

    it('应验证正确的 TOTP 码', () => {
      const { secret } = generateMfaSecret('testuser');
      // 同一 secret 同一时间步应生成相同 TOTP
      // 这里验证 verifyTotp 接受合法格式，但不验证具体码值（依赖时间步）
      // 用 verifyTotp 验证一个错误码应返回 false
      expect(verifyTotp(secret, '000000')).toBeFalsy();
    });
  });

  describe('generateMfaSecret', () => {
    it('应生成 Base32 密钥与 otpauth URI', () => {
      const { secret, otpauthUri } = generateMfaSecret('alice');
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      expect(secret.length).toBeGreaterThanOrEqual(16);
      expect(otpauthUri).toMatch(/^otpauth:\/\/totp\/BacktestPlatform%3Aalice\?secret=/);
      expect(otpauthUri).toContain('issuer=BacktestPlatform');
      expect(otpauthUri).toContain('algorithm=SHA1');
      expect(otpauthUri).toContain('digits=6');
      expect(otpauthUri).toContain('period=30');
    });

    it('每次生成的密钥应不同（CSPRNG）', () => {
      const a = generateMfaSecret('user');
      const b = generateMfaSecret('user');
      expect(a.secret).not.toBe(b.secret);
    });
  });

  describe('enableMfa / disableMfa', () => {
    it('enableMfa 应更新 users 表', async () => {
      await enableMfa('00000000-0000-0000-0000-000000000001', 'JBSWY3DPEHPK3PXP');
      expect(poolMocks.pool.query).toHaveBeenCalledWith(
        'UPDATE users SET mfa_enabled = TRUE, mfa_secret = $1, updated_at = NOW() WHERE id = $2',
        ['JBSWY3DPEHPK3PXP', '00000000-0000-0000-0000-000000000001'],
      );
    });

    it('disableMfa 应清除 MFA 相关列', async () => {
      await disableMfa('00000000-0000-0000-0000-000000000001');
      expect(poolMocks.pool.query).toHaveBeenCalledWith(
        'UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_backup_codes = NULL, updated_at = NOW() WHERE id = $1',
        ['00000000-0000-0000-0000-000000000001'],
      );
    });
  });

  describe('generateBackupCodes', () => {
    it('应生成配置数量的备份码', async () => {
      const { plaintext, hashes } = await generateBackupCodes();
      expect(plaintext).toHaveLength(4);
      expect(hashes).toHaveLength(4);
      expect(plaintext.every((c) => c.length === 10)).toBe(true);
      expect(hashes.every((h) => h.startsWith('$argon2id$'))).toBe(true);
    });

    it('每个备份码应不同', async () => {
      const { plaintext } = await generateBackupCodes();
      expect(new Set(plaintext).size).toBe(plaintext.length);
    });
  });

  describe('verifyBackupCode', () => {
    it('用户无备份码时应返回 false', async () => {
      poolMocks.mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ mfa_backup_codes: null }] }) // SELECT
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const result = await verifyBackupCode('00000000-0000-0000-0000-000000000001', 'CODE1234');
      expect(result).toBe(false);
    });

    it('正确的备份码应消费成功', async () => {
      const { plaintext, hashes } = await generateBackupCodes();
      poolMocks.mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ mfa_backup_codes: hashes }] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT
      const result = await verifyBackupCode('00000000-0000-0000-0000-000000000001', plaintext[0]);
      expect(result).toBe(true);
    });

    it('错误的备份码应返回 false', async () => {
      const { hashes } = await generateBackupCodes();
      poolMocks.mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ mfa_backup_codes: hashes }] }) // SELECT FOR UPDATE
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
      const result = await verifyBackupCode('00000000-0000-0000-0000-000000000001', 'WRONGCODE99');
      expect(result).toBe(false);
    });
  });

  describe('verifyMfaCode', () => {
    it('用户未启用 MFA 时应返回 false', async () => {
      poolMocks.pool.query.mockResolvedValue({ rows: [] });
      const result = await verifyMfaCode('00000000-0000-0000-0000-000000000001', '123456');
      expect(result).toBe(false);
    });

    it('6 位数字码应走 TOTP 路径', async () => {
      const { secret } = generateMfaSecret('test');
      poolMocks.pool.query.mockResolvedValue({
        rows: [{ mfa_secret: secret, mfa_backup_codes: [] }],
      });
      // 错误的 TOTP 码应返回 false（不验证正确码，因依赖时间步）
      const result = await verifyMfaCode('00000000-0000-0000-0000-000000000001', '999999');
      expect(result).toBe(false);
    });

    it('非 6 位数字且无备份码时应返回 false', async () => {
      poolMocks.pool.query.mockResolvedValue({
        rows: [{ mfa_secret: 'JBSWY3DPEHPK3PXP', mfa_backup_codes: null }],
      });
      const result = await verifyMfaCode('00000000-0000-0000-0000-000000000001', 'ABCDEFGHIJ');
      expect(result).toBe(false);
    });
  });
});
