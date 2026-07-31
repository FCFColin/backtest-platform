import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import { mockUserRecord, mockUserRecordWithPassword } from '../../helpers/authFixtures.js';

const mocks = vi.hoisted(() => ({
  argon2: { hash: vi.fn(), verify: vi.fn(), argon2id: 'argon2id' },
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
  createUser,
  getUserById,
  getUserByEmail,
  deactivateUser,
  anonymizeUser,
  deleteUser,
  createUserTx,
} from '../../../packages/backend/src/repositories/userRepo.js';
import {
  verifyUser,
  issueEmailVerificationToken,
  verifyEmailToken,
} from '../../../packages/backend/src/application/auth/userService.js';

const reset = () => {
  vi.clearAllMocks();
  mocks.argon2.hash.mockResolvedValue('hashed-password');
};
const qOnce = (rows: unknown[]) => mocks.pool.query.mockResolvedValueOnce({ rows });
const qRowCount = (n: number) => mocks.pool.query.mockResolvedValueOnce({ rowCount: n });
const txClient = (row: Record<string, unknown>) => ({
  query: vi.fn().mockResolvedValue({ rows: [row] }),
});
const firstSql = () => mocks.pool.query.mock.calls[0][0] as string;
describe('createUser - 用户创建', () => {
  beforeEach(() => {
    reset();
    qOnce([mockUserRecord()]);
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
    {
      name: 'SQL 注入用户名应作为参数传递（不拼接 SQL）',
      username: "'; DROP TABLE users; --",
      role: undefined,
      expectedRole: 'analyst',
      checkPlaceholders: true,
    },
  ])('应支持 $name', async ({ username, role, expectedRole, checkPlaceholders }) => {
    await createUser(username, 'password123', role);
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([username, 'hashed-password', expectedRole]),
    );
    if (checkPlaceholders) expect(firstSql()).not.toContain('DROP TABLE');
  });
  it('应返回正确的用户对象', async () => {
    expect(await createUser('testuser', 'password123', 'admin')).toEqual({
      id: 'user-123',
      username: 'testuser',
      role: 'analyst',
      createdAt: expect.any(Date),
      isActive: true,
    });
  });
  it('应使用参数化查询防止 SQL 注入', async () => {
    await createUser('testuser', 'password123');
    expect(firstSql()).toContain('$1');
    expect(firstSql()).toContain('$2');
    expect(firstSql()).toContain('$3');
  });
});
describe('边界与异常', () => {
  beforeEach(reset);
  it('空用户名应能传递到数据库层（由 DB 约束拒绝）', async () => {
    qOnce([mockUserRecord({ username: '', created_at: new Date() })]);
    expect((await createUser('', 'password')).username).toBe('');
  });
  it.each([
    {
      name: 'argon2.hash 异常',
      setup: () => mocks.argon2.hash.mockRejectedValueOnce(new Error('hash failed')),
      expected: 'hash failed',
    },
    {
      name: '数据库异常',
      setup: () => mocks.pool.query.mockRejectedValueOnce(new Error('DB connection failed')),
      expected: 'DB connection failed',
    },
    {
      name: '重复用户名（DB 唯一约束）',
      setup: () =>
        mocks.pool.query.mockRejectedValueOnce(
          new Error('duplicate key value violates unique constraint'),
        ),
      expected: 'duplicate key',
    },
  ])('$name 应向上抛出', async ({ setup, expected }) => {
    setup();
    await expect(createUser('testuser', 'password')).rejects.toThrow(expected);
  });
});
describe('verifyUser - 密码验证', () => {
  beforeEach(reset);
  it.each([
    [
      '正确密码应返回用户对象',
      [{ rows: [mockUserRecordWithPassword({ role: 'admin' })] }, true],
      true,
    ],
    [
      '错误密码应返回 null',
      [{ rows: [mockUserRecordWithPassword({ role: 'admin' })] }, false],
      false,
    ],
    ['不存在的用户应返回 null', [{ rows: [] }, null], false],
  ])('%s', async (_n, [q, verifyResult], found) => {
    mocks.pool.query.mockResolvedValueOnce(q);
    if (verifyResult !== null) mocks.argon2.verify.mockResolvedValueOnce(verifyResult);
    const user = await verifyUser('testuser', 'password');
    if (found) {
      expect(user).not.toBeNull();
      expect(user).toMatchObject({ id: 'user-123', username: 'testuser', role: 'admin' });
    } else {
      expect(user).toBeNull();
    }
  });
  it.each([
    [
      '不存在的用户仍应执行 argon2.hash 防止时序攻击',
      'nonexistent',
      () =>
        expect(mocks.argon2.hash).toHaveBeenCalledWith(
          'dummy-password',
          expect.objectContaining({ type: 'argon2id' }),
        ),
    ],
    [
      '仅查询 is_active=true 的用户',
      'inactive',
      () => expect(firstSql()).toContain('is_active = true'),
    ],
    [
      'SQL 注入用户名应作为参数传递',
      "' OR '1'='1",
      () =>
        expect(mocks.pool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining(["' OR '1'='1"]),
        ),
    ],
  ])('%s', async (_n, username, check) => {
    qOnce([]);
    mocks.argon2.hash.mockResolvedValueOnce('dummy-hash');
    await verifyUser(username, 'password');
    check();
  });
  it('验证成功应更新最后登录时间', async () => {
    mocks.pool.query
      .mockResolvedValueOnce({ rows: [mockUserRecordWithPassword({ role: 'admin' })] })
      .mockResolvedValueOnce({ rows: [] });
    mocks.argon2.verify.mockResolvedValueOnce(true);
    await verifyUser('testuser', 'correct-password');
    const secondCall = mocks.pool.query.mock.calls[1];
    expect(secondCall[0]).toContain('UPDATE users SET last_login_at');
    expect(secondCall[1]).toEqual(['user-123']);
  });
  it('验证失败不应更新最后登录时间', async () => {
    qOnce([mockUserRecordWithPassword({ role: 'admin' })]);
    mocks.argon2.verify.mockResolvedValueOnce(false);
    await verifyUser('testuser', 'wrong-password');
    expect(mocks.pool.query).toHaveBeenCalledTimes(1);
  });
});
describe('getUserById - 按 ID 查询', () => {
  beforeEach(reset);
  it.each<[string, unknown[], (user: unknown) => void]>([
    [
      '存在的用户 ID 应返回用户对象',
      [{ rows: [mockUserRecord({ role: 'admin' })] }],
      (user) => expect(user).toMatchObject({ id: 'user-123', username: 'testuser' }),
    ],
    ['不存在的用户 ID 应返回 null', [{ rows: [] }], (user) => expect(user).toBeNull()],
    [
      '应使用参数化查询',
      [{ rows: [] }],
      () => expect(mocks.pool.query).toHaveBeenCalledWith(expect.any(String), ['user-123']),
    ],
  ])('%s', async (_n, [q], check) => {
    mocks.pool.query.mockResolvedValueOnce(q);
    check(await getUserById('user-123'));
  });
});
describe('getUserByEmail - 按邮箱查询', () => {
  beforeEach(reset);
  it.each<[string, unknown[], (user: { id: string } | null) => void]>([
    [
      '存在的邮箱应返回用户',
      [
        {
          rows: [
            mockUserRecord({
              id: 'u1',
              username: 'test',
              role: 'admin',
              created_at: new Date('2026-01-01'),
            }),
          ],
        },
      ],
      (user) => expect(user!.id).toBe('u1'),
    ],
    ['不存在的邮箱应返回 null', [{ rows: [] }], (user) => expect(user).toBeNull()],
    [
      '应大小写不敏感查询',
      [{ rows: [mockUserRecord({ id: 'u2', username: 'CaseUser', created_at: new Date() })] }],
      () =>
        expect(mocks.pool.query).toHaveBeenCalledWith(
          expect.stringContaining('lower(email) = lower($1)'),
          expect.arrayContaining(['CASE@TEST.COM']),
        ),
    ],
  ])('%s', async (_n, [q], check) => {
    mocks.pool.query.mockResolvedValueOnce(q);
    check(await getUserByEmail('CASE@TEST.COM'));
  });
});
describe('用户生命周期操作（deactivate / anonymize / delete）', () => {
  beforeEach(reset);
  it.each<[string, (id: string) => Promise<boolean>, number, boolean]>([
    ['deactivateUser 存在的活跃用户应被停用', deactivateUser, 1, true],
    ['deactivateUser 不存在的用户应返回 false', deactivateUser, 0, false],
    ['anonymizeUser 应替换用户名并清空密码', anonymizeUser, 1, true],
    ['anonymizeUser 无匹配用户应返回 false', anonymizeUser, 0, false],
    ['deleteUser 应执行 DELETE 并返回 true', deleteUser, 1, true],
    ['deleteUser 无匹配记录应返回 false', deleteUser, 0, false],
  ])('%s', async (_n, fn, rowCount, expected) => {
    qRowCount(rowCount);
    expect(await fn('user-123')).toBe(expected);
  });
  it('deactivateUser 应设置 is_active = false', async () => {
    qRowCount(1);
    await deactivateUser('user-123');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringContaining('is_active = false'), [
      'user-123',
    ]);
  });
  it('anonymizeUser 应使用 deleted_ 前缀和 password_hash =', async () => {
    qRowCount(1);
    await anonymizeUser('abcd-1234-efgh-5678');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringContaining('password_hash ='), [
      'abcd-1234-efgh-5678',
      'deleted_abcd1234',
    ]);
  });
  it('deleteUser 应使用 DELETE FROM users WHERE id = $1', async () => {
    qRowCount(1);
    await deleteUser('user-123');
    expect(mocks.pool.query).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', ['user-123']);
  });
});
describe('createUserTx - 事务内创建用户', () => {
  beforeEach(reset);
  it('应使用事务客户端插入并返回用户', async () => {
    const client = txClient(
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
  it.each([
    ['email 为 null 时应传入 null', 'nullemail', null, 'readonly'],
    ['默认角色应为 analyst', 'def', null, undefined],
  ])('%s', async (_n, username, email, role) => {
    const client = txClient(
      mockUserRecord({ id: 'u2', username, role: role ?? 'analyst', created_at: new Date() }),
    );
    const user = await createUserTx(client as never, username, 'pass', email, role);
    expect(user.role).toBe(role ?? 'analyst');
    if (role) {
      expect(client.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([username, 'hashed-password', role, null]),
      );
    }
  });
});
describe('issueEmailVerificationToken - 签发邮箱验证令牌', () => {
  beforeEach(() => {
    reset();
    mocks.pool.query.mockResolvedValue({ rowCount: 1 });
  });
  it('应生成随机令牌并存储其 SHA-256 哈希', async () => {
    expect(await issueEmailVerificationToken('user-1')).toBe('mocked-random-token');
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
  it.each([
    ['令牌不存在或已消费应返回 null 并 ROLLBACK', [{ rows: [] }], 'ROLLBACK', null],
    [
      '令牌有效应验证并消费并 COMMIT',
      [{ rows: [{ id: 'tok-1', user_id: 'user-1' }] }],
      'COMMIT',
      'user-1',
    ],
  ])('%s', async (_n, [q], finalSql, expected) => {
    mocks.poolClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(q)
      .mockResolvedValueOnce(undefined);
    expect(await verifyEmailToken('valid-token')).toBe(expected);
    expect(mocks.poolClient.query).toHaveBeenCalledWith(finalSql);
  });
  it('数据库异常时应回滚并返回 null', async () => {
    mocks.poolClient.query.mockRejectedValueOnce(new Error('tx failed'));
    expect(await verifyEmailToken('valid-token')).toBeNull();
    expect(mocks.poolClient.release).toHaveBeenCalled();
  });
});
