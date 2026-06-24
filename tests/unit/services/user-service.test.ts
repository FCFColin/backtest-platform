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
  },
}));

vi.mock('argon2', () => ({
  default: mocks.argon2,
  ...mocks.argon2,
}));

vi.mock('../../../api/db/index.js', () => ({
  getPool: () => mocks.pool,
}));

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn() })),
  },
}));

import { createUser, verifyUser, getUserById } from '../../../api/services/userService.js';

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
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.any(String),
      ['user-123'],
    );
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
    mocks.pool.query.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'));
    await expect(createUser('duplicate', 'password')).rejects.toThrow('duplicate key');
  });
});
