/**
 * 用户服务测试 - 创建与边界（拆分自 user-service.test.ts Task 5.16）
 *
 * 企业理由：用户创建是认证体系入口，密码哈希、角色分配、SQL 注入防护的正确性
 * 直接影响安全。本文件覆盖 createUser 正常路径 + 边界异常。
 *
 * 拆分原因：原文件 497 行超过单文件可读性阈值。按方法分组：
 * - part1（本文件）：createUser + 边界异常
 * - part2：verifyUser + getUserById + getUserByEmail
 * - part3：lifecycle (deactivate/anonymize/delete/createUserTx) + email verification
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import { mockUserRecord } from '../../helpers/userFixtures.js';

const mocks = vi.hoisted(() => ({
  argon2: { hash: vi.fn(), verify: vi.fn(), argon2id: 'argon2id' },
  pool: { query: vi.fn() },
}));

vi.mock('argon2', () => ({ default: mocks.argon2, ...mocks.argon2 }));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({ getPool: () => mocks.pool }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import { createUser } from '../../../packages/backend/src/repositories/userRepo.js';

describe('createUser - 用户创建', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.argon2.hash.mockResolvedValue('hashed-password');
    mocks.pool.query.mockResolvedValue({ rows: [mockUserRecord()] });
  });

  it.each([
    { name: 'argon2id 哈希密码', expected: { type: 'argon2id' } },
    { name: '64MB 内存成本', expected: { memoryCost: 65536 } },
    { name: '3 次迭代', expected: { timeCost: 3 } },
  ])('应使用 $name', async ({ expected }) => {
    await createUser('testuser', 'password123');
    expect(mocks.argon2.hash).toHaveBeenCalledWith(
      'password123',
      expect.objectContaining(expected),
    );
  });

  it.each([
    { name: '默认 analyst 角色', username: 'testuser', role: undefined, expectedRole: 'analyst' },
    { name: '指定 admin 角色', username: 'adminuser', role: 'admin', expectedRole: 'admin' },
    {
      name: '指定 readonly 角色',
      username: 'readonlyuser',
      role: 'readonly',
      expectedRole: 'readonly',
    },
  ])('应支持 $name', async ({ username, role, expectedRole }) => {
    await createUser(username, 'password123', role);
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([username, 'hashed-password', expectedRole]),
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
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([maliciousName]),
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
      rows: [mockUserRecord({ username: '', created_at: new Date() })],
    });
    const user = await createUser('', 'password');
    expect(user.username).toBe('');
  });

  it.each([
    {
      name: 'argon2.hash 异常',
      setup: () => mocks.argon2.hash.mockRejectedValueOnce(new Error('hash failed')),
      username: 'testuser',
      expected: 'hash failed',
    },
    {
      name: '数据库异常',
      setup: () => mocks.pool.query.mockRejectedValueOnce(new Error('DB connection failed')),
      username: 'testuser',
      expected: 'DB connection failed',
    },
    {
      name: '重复用户名（DB 唯一约束）',
      setup: () =>
        mocks.pool.query.mockRejectedValueOnce(
          new Error('duplicate key value violates unique constraint'),
        ),
      username: 'duplicate',
      expected: 'duplicate key',
    },
  ])('$name 应向上抛出', async ({ setup, username, expected }) => {
    setup();
    await expect(createUser(username, 'password')).rejects.toThrow(expected);
  });
});
