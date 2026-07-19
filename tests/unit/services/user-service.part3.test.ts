/**
 * 用户服务测试 - 生命周期与邮箱验证（拆分自 user-service.test.ts Task 5.16）
 *
 * 企业理由：用户停用/GDPR 匿名化/物理删除是合规与隐私关键路径；
 * 邮箱验证令牌签发与消费是账户恢复入口，事务一致性不可妥协。
 *
 * 拆分原因：原文件 497 行超过单文件可读性阈值。
 * - part1：createUser + 边界异常
 * - part2：verifyUser + getUserById + getUserByEmail
 * - part3（本文件）：lifecycle (deactivate/anonymize/delete/createUserTx) + email verification
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import { mockUserRecord } from '../../helpers/userFixtures.js';

const mocks = vi.hoisted(() => ({
  argon2: { hash: vi.fn(), argon2id: 'argon2id' },
  pool: { query: vi.fn(), connect: vi.fn() },
  poolClient: { query: vi.fn(), release: vi.fn() },
  crypto: {
    randomBytes: vi.fn(() => ({ toString: vi.fn(() => 'mocked-random-token') })),
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'mocked-sha256-hex'),
    })),
  },
}));

vi.mock('argon2', () => ({ default: mocks.argon2, ...mocks.argon2 }));
vi.mock('crypto', () => ({
  default: { randomBytes: mocks.crypto.randomBytes, createHash: mocks.crypto.createHash },
  randomBytes: mocks.crypto.randomBytes,
  createHash: mocks.crypto.createHash,
}));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({ getPool: () => mocks.pool }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import {
  deactivateUser,
  anonymizeUser,
  deleteUser,
  createUserTx,
} from '../../../packages/backend/src/repositories/userRepo.js';
import {
  issueEmailVerificationToken,
  verifyEmailToken,
} from '../../../packages/backend/src/services/userService.js';

/** 创建事务客户端 mock（复用 mockUserRecord 构造行） */
function createTxClient(row: Record<string, unknown>) {
  return { query: vi.fn().mockResolvedValue({ rows: [row] }) };
}

describe('deactivateUser - 用户停用', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('存在的活跃用户应被停用', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rowCount: 1 });
    const ok = await deactivateUser('user-123');
    expect(ok).toBe(true);
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringContaining('is_active = false'), [
      'user-123',
    ]);
  });

  it('不存在的用户应返回 false', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rowCount: 0 });
    const ok = await deactivateUser('missing');
    expect(ok).toBe(false);
  });
});

describe('anonymizeUser - GDPR 匿名化', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应替换用户名为 deleted_ 前缀并清空密码', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rowCount: 1 });
    const ok = await anonymizeUser('abcd-1234-efgh-5678');
    expect(ok).toBe(true);
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringContaining('password_hash ='), [
      'abcd-1234-efgh-5678',
      'deleted_abcd1234',
    ]);
  });

  it('无匹配用户应返回 false', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rowCount: 0 });
    const ok = await anonymizeUser('no-user');
    expect(ok).toBe(false);
  });
});

describe('deleteUser - 物理删除', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应执行 DELETE 并返回 true', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rowCount: 1 });
    const ok = await deleteUser('user-123');
    expect(ok).toBe(true);
    expect(mocks.pool.query).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', ['user-123']);
  });

  it('无匹配记录应返回 false', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rowCount: 0 });
    const ok = await deleteUser('ghost');
    expect(ok).toBe(false);
  });
});

describe('createUserTx - 事务内创建用户', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.argon2.hash.mockResolvedValue('hashed-password');
  });

  it('应使用事务客户端插入并返回用户', async () => {
    const client = createTxClient(
      mockUserRecord({
        id: 'u1',
        username: 'txuser',
        role: 'analyst',
        created_at: new Date('2026-01-01'),
      }),
    );
    const user = await createUserTx(client as never, 'txuser', 'pass123', 'tx@test.com', 'analyst');
    expect(user).toMatchObject({ id: 'u1', username: 'txuser', role: 'analyst', isActive: true });
    expect(mocks.argon2.hash).toHaveBeenCalledWith('pass123', expect.any(Object));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['txuser', 'hashed-password', 'analyst', 'tx@test.com']),
    );
  });

  it('email 为 null 时应传入 null', async () => {
    const client = createTxClient(
      mockUserRecord({ id: 'u2', username: 'nullemail', role: 'readonly', created_at: new Date() }),
    );
    const user = await createUserTx(client as never, 'nullemail', 'pass', null, 'readonly');
    expect(user.role).toBe('readonly');
    expect(client.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['nullemail', 'hashed-password', 'readonly', null]),
    );
  });

  it('默认角色应为 analyst', async () => {
    const client = createTxClient(
      mockUserRecord({ id: 'u3', username: 'def', role: 'analyst', created_at: new Date() }),
    );
    const user = await createUserTx(client as never, 'def', 'pass', null);
    expect(user.role).toBe('analyst');
  });
});

describe('issueEmailVerificationToken - 签发邮箱验证令牌', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.query.mockResolvedValue({ rowCount: 1 });
  });

  it('应生成随机令牌并存储其 SHA-256 哈希', async () => {
    const token = await issueEmailVerificationToken('user-1');
    expect(token).toBe('mocked-random-token');
    expect(mocks.crypto.randomBytes).toHaveBeenCalledWith(32);
    expect(mocks.crypto.createHash).toHaveBeenCalledWith('sha256');
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO email_verification_tokens'),
      ['user-1', 'mocked-sha256-hex', expect.any(Date)],
    );
  });
});

describe('verifyEmailToken - 校验邮箱验证令牌', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.connect.mockResolvedValue(mocks.poolClient);
    mocks.poolClient.query.mockReset();
    mocks.poolClient.release.mockReset();
  });

  it.each([
    { name: '空字符串', token: '' },
    { name: '超过 256 字符的令牌', token: 'x'.repeat(257) },
  ])('$name 应返回 null', async ({ token }) => {
    expect(await verifyEmailToken(token)).toBeNull();
  });

  it('令牌不存在或已消费应返回 null', async () => {
    mocks.poolClient.query.mockResolvedValueOnce(undefined); // BEGIN
    mocks.poolClient.query.mockResolvedValueOnce({ rows: [] }); // SELECT
    mocks.poolClient.query.mockResolvedValueOnce(undefined); // ROLLBACK
    const result = await verifyEmailToken('valid-token');
    expect(result).toBeNull();
    expect(mocks.poolClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('令牌有效应验证并消费', async () => {
    mocks.poolClient.query.mockResolvedValueOnce(undefined); // BEGIN
    mocks.poolClient.query.mockResolvedValueOnce({ rows: [{ id: 'tok-1', user_id: 'user-1' }] }); // SELECT FOR UPDATE
    mocks.poolClient.query.mockResolvedValueOnce(undefined); // UPDATE consumed_at
    mocks.poolClient.query.mockResolvedValueOnce(undefined); // UPDATE email_verified_at
    mocks.poolClient.query.mockResolvedValueOnce(undefined); // COMMIT
    const result = await verifyEmailToken('valid-token');
    expect(result).toBe('user-1');
    expect(mocks.poolClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('数据库异常时应回滚并返回 null', async () => {
    mocks.poolClient.query.mockRejectedValueOnce(new Error('tx failed'));
    const result = await verifyEmailToken('valid-token');
    expect(result).toBeNull();
    expect(mocks.poolClient.release).toHaveBeenCalled();
  });
});
