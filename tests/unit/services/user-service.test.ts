/**
 * 用户服务模块单元测试（T-P3-7）
 *
 * 企业理由：用户服务是认证体系的基础，密码哈希、角色分配、
 * 用户查询的正确性直接影响安全与审计。测试覆盖：
 * - 用户创建（argon2id 哈希、角色分配）
 * - 密码验证（正确/错误/不存在用户）
 * - 用户查询（按 ID）
 * - 边界（重复用户名、空用户名、SQL 注入向量）
 *
 * Mock 策略：mock argon2（避免真实哈希开销）与 db pool（避免数据库依赖）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted 确保 mock 变量在 vi.mock 提升前完成初始化
const mocks = vi.hoisted(() => ({
  argon2: {
    hash: vi.fn(),
    verify: vi.fn(),
    argon2id: 'argon2id',
  },
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
  poolClient: {
    query: vi.fn(),
    release: vi.fn(),
  },
  crypto: {
    randomBytes: vi.fn(() => ({
      toString: vi.fn(() => 'mocked-random-token'),
    })),
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'mocked-sha256-hex'),
    })),
  },
}));

vi.mock('argon2', () => ({
  default: mocks.argon2,
  ...mocks.argon2,
}));

vi.mock('crypto', () => ({
  default: {
    randomBytes: mocks.crypto.randomBytes,
    createHash: mocks.crypto.createHash,
  },
  randomBytes: mocks.crypto.randomBytes,
  createHash: mocks.crypto.createHash,
}));

vi.mock('../../../api/db/index.js', () => ({
  getPool: () => mocks.pool,
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';
vi.mock('../../../api/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import {
  createUser,
  verifyUser,
  getUserById,
  deactivateUser,
  anonymizeUser,
  deleteUser,
  createUserTx,
  getUserByEmail,
  issueEmailVerificationToken,
  verifyEmailToken,
} from '../../../api/services/userService.js';

describe('createUser - 用户创建', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.argon2.hash.mockResolvedValue('hashed-password');
    mocks.pool.query.mockResolvedValue({
      rows: [
        {
          id: 'user-123',
          username: 'testuser',
          role: 'analyst',
          created_at: new Date('2020-01-02'),
          is_active: true,
        },
      ],
    });
  });

  it('应使用 argon2id 哈希密码', async () => {
    await createUser('testuser', 'password123');
    expect(mocks.argon2.hash).toHaveBeenCalledWith(
      'password123',
      expect.objectContaining({ type: 'argon2id' }),
    );
  });

  it('应使用 64MB 内存成本', async () => {
    await createUser('testuser', 'password123');
    expect(mocks.argon2.hash).toHaveBeenCalledWith(
      'password123',
      expect.objectContaining({ memoryCost: 65536 }),
    );
  });

  it('应使用 3 次迭代', async () => {
    await createUser('testuser', 'password123');
    expect(mocks.argon2.hash).toHaveBeenCalledWith(
      'password123',
      expect.objectContaining({ timeCost: 3 }),
    );
  });

  it('默认角色应为 analyst', async () => {
    await createUser('testuser', 'password123');
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['testuser', 'hashed-password', 'analyst']),
    );
  });

  it('应支持指定 admin 角色', async () => {
    await createUser('adminuser', 'password123', 'admin');
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['adminuser', 'hashed-password', 'admin']),
    );
  });

  it('应支持指定 readonly 角色', async () => {
    await createUser('readonlyuser', 'password123', 'readonly');
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['readonlyuser', 'hashed-password', 'readonly']),
    );
  });

  it('应返回正确的用户对象', async () => {
    const user = await createUser('testuser', 'password123', 'admin');
    expect(user).toEqual({
      id: 'user-123',
      username: 'testuser',
      role: 'analyst', // 来自 mock 返回
      createdAt: expect.any(Date),
      isActive: true,
    });
  });

  it('应使用参数化查询防止 SQL 注入', async () => {
    await createUser('testuser', 'password123');
    const sql = mocks.pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('$1');
    expect(sql).toContain('$2');
    expect(sql).toContain('$3');
  });

  it('SQL 注入用户名应作为参数传递（不拼接 SQL）', async () => {
    const maliciousName = "'; DROP TABLE users; --";
    await createUser(maliciousName, 'password123');
    // 应作为参数传递，而非拼入 SQL
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([maliciousName]),
    );
  });
});

describe('verifyUser - 密码验证', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正确密码应返回用户对象', async () => {
    mocks.pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          username: 'testuser',
          password_hash: 'hashed-password',
          role: 'admin',
          created_at: new Date('2020-01-02'),
          is_active: true,
        },
      ],
    });
    mocks.argon2.verify.mockResolvedValueOnce(true);

    const user = await verifyUser('testuser', 'correct-password');
    expect(user).not.toBeNull();
    expect(user!.id).toBe('user-123');
    expect(user!.username).toBe('testuser');
    expect(user!.role).toBe('admin');
  });

  it('错误密码应返回 null', async () => {
    mocks.pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          username: 'testuser',
          password_hash: 'hashed-password',
          role: 'admin',
          created_at: new Date('2020-01-02'),
          is_active: true,
        },
      ],
    });
    mocks.argon2.verify.mockResolvedValueOnce(false);

    const user = await verifyUser('testuser', 'wrong-password');
    expect(user).toBeNull();
  });

  it('不存在的用户应返回 null', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rows: [] });
    mocks.argon2.hash.mockResolvedValueOnce('dummy-hash');

    const user = await verifyUser('nonexistent', 'password');
    expect(user).toBeNull();
  });

  it('不存在的用户仍应执行 argon2.hash 防止时序攻击', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rows: [] });
    mocks.argon2.hash.mockResolvedValueOnce('dummy-hash');

    await verifyUser('nonexistent', 'password');
    expect(mocks.argon2.hash).toHaveBeenCalledWith(
      'dummy-password',
      expect.objectContaining({ type: 'argon2id' }),
    );
  });

  it('验证成功应更新最后登录时间', async () => {
    mocks.pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            username: 'testuser',
            password_hash: 'hashed-password',
            role: 'admin',
            created_at: new Date('2020-01-02'),
            is_active: true,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    mocks.argon2.verify.mockResolvedValueOnce(true);

    await verifyUser('testuser', 'correct-password');
    // 第二次 query 应为 UPDATE last_login_at
    const secondCall = mocks.pool.query.mock.calls[1];
    expect(secondCall[0]).toContain('UPDATE users SET last_login_at');
    expect(secondCall[1]).toEqual(['user-123']);
  });

  it('验证失败不应更新最后登录时间', async () => {
    mocks.pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          username: 'testuser',
          password_hash: 'hashed-password',
          role: 'admin',
          created_at: new Date('2020-01-02'),
          is_active: true,
        },
      ],
    });
    mocks.argon2.verify.mockResolvedValueOnce(false);

    await verifyUser('testuser', 'wrong-password');
    // 仅 1 次 query（SELECT），无 UPDATE
    expect(mocks.pool.query).toHaveBeenCalledTimes(1);
  });

  it('仅查询 is_active=true 的用户', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rows: [] });
    mocks.argon2.hash.mockResolvedValueOnce('dummy');

    await verifyUser('inactive', 'password');
    const sql = mocks.pool.query.mock.calls[0][0] as string;
    expect(sql).toContain('is_active = true');
  });

  it('SQL 注入用户名应作为参数传递', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rows: [] });
    mocks.argon2.hash.mockResolvedValueOnce('dummy');

    const malicious = "' OR '1'='1";
    await verifyUser(malicious, 'password');
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([malicious]),
    );
  });
});

describe('getUserById - 按 ID 查询', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('存在的用户 ID 应返回用户对象', async () => {
    mocks.pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          username: 'testuser',
          role: 'admin',
          created_at: new Date('2020-01-02'),
          is_active: true,
        },
      ],
    });

    const user = await getUserById('user-123');
    expect(user).not.toBeNull();
    expect(user!.id).toBe('user-123');
    expect(user!.username).toBe('testuser');
  });

  it('不存在的用户 ID 应返回 null', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rows: [] });

    const user = await getUserById('nonexistent-id');
    expect(user).toBeNull();
  });

  it('应使用参数化查询', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rows: [] });
    await getUserById('user-123');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.any(String), ['user-123']);
  });
});

describe('边界与异常', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.argon2.hash.mockResolvedValue('hashed-password');
  });

  it('空用户名应能传递到数据库层（由 DB 约束拒绝）', async () => {
    mocks.pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-123',
          username: '',
          role: 'analyst',
          created_at: new Date(),
          is_active: true,
        },
      ],
    });
    const user = await createUser('', 'password');
    expect(user.username).toBe('');
  });

  it('argon2.hash 异常应向上抛出', async () => {
    mocks.argon2.hash.mockRejectedValueOnce(new Error('hash failed'));
    await expect(createUser('testuser', 'password')).rejects.toThrow('hash failed');
  });

  it('数据库异常应向上抛出', async () => {
    mocks.pool.query.mockRejectedValueOnce(new Error('DB connection failed'));
    await expect(createUser('testuser', 'password')).rejects.toThrow('DB connection failed');
  });

  it('重复用户名应由 DB 唯一约束拒绝（抛出异常）', async () => {
    mocks.pool.query.mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint'),
    );
    await expect(createUser('duplicate', 'password')).rejects.toThrow('duplicate key');
  });
});

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
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'u1',
            username: 'txuser',
            role: 'analyst',
            created_at: new Date('2026-01-01'),
            is_active: true,
          },
        ],
      }),
    };
    const user = await createUserTx(client as never, 'txuser', 'pass123', 'tx@test.com', 'analyst');
    expect(user).toMatchObject({ id: 'u1', username: 'txuser', role: 'analyst', isActive: true });
    expect(mocks.argon2.hash).toHaveBeenCalledWith('pass123', expect.any(Object));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['txuser', 'hashed-password', 'analyst', 'tx@test.com']),
    );
  });

  it('email 为 null 时应传入 null', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'u2',
            username: 'nullemail',
            role: 'readonly',
            created_at: new Date(),
            is_active: true,
          },
        ],
      }),
    };
    const user = await createUserTx(client as never, 'nullemail', 'pass', null, 'readonly');
    expect(user.role).toBe('readonly');
    expect(client.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['nullemail', 'hashed-password', 'readonly', null]),
    );
  });

  it('默认角色应为 analyst', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { id: 'u3', username: 'def', role: 'analyst', created_at: new Date(), is_active: true },
        ],
      }),
    };
    const user = await createUserTx(client as never, 'def', 'pass', null);
    expect(user.role).toBe('analyst');
  });
});

describe('getUserByEmail - 按邮箱查询', () => {
  beforeEach(() => vi.clearAllMocks());

  it('存在的邮箱应返回用户', async () => {
    mocks.pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'u1',
          username: 'test',
          role: 'admin',
          created_at: new Date('2026-01-01'),
          is_active: true,
        },
      ],
    });
    const user = await getUserByEmail('test@example.com');
    expect(user).not.toBeNull();
    expect(user!.id).toBe('u1');
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('lower(email) = lower($1)'),
      ['test@example.com'],
    );
  });

  it('不存在的邮箱应返回 null', async () => {
    mocks.pool.query.mockResolvedValueOnce({ rows: [] });
    expect(await getUserByEmail('missing@test.com')).toBeNull();
  });

  it('应大小写不敏感查询', async () => {
    mocks.pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'u2',
          username: 'CaseUser',
          role: 'analyst',
          created_at: new Date(),
          is_active: true,
        },
      ],
    });
    const user = await getUserByEmail('CASE@TEST.COM');
    expect(user).not.toBeNull();
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('lower(email) = lower($1)'),
      expect.arrayContaining(['CASE@TEST.COM']),
    );
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

  it('空字符串应返回 null', async () => {
    expect(await verifyEmailToken('')).toBeNull();
  });

  it('超过 256 字符的令牌应返回 null', async () => {
    expect(await verifyEmailToken('x'.repeat(257))).toBeNull();
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
