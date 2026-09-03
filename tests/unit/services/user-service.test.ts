import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWithTransactionMock } from '../../helpers/poolFixture.js';
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
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => mocks.pool,
  withTransaction: createWithTransactionMock(() => mocks.pool.connect()),
}));
import {
  getUserById,
  getUserByEmail,
  anonymizeUser,
  createUserTx,
} from '../../../packages/backend/src/repositories/userRepo.js';
import {
  verifyUser,
  issueEmailVerificationToken,
  verifyEmailToken,
  registerUser,
} from '../../../packages/backend/src/application/auth/userService.js';

const reset = () => (vi.clearAllMocks(), mocks.argon2.hash.mockResolvedValue('hashed-password')),
  setupTxPoolMocks = () => (
    vi.clearAllMocks(),
    mocks.pool.connect.mockResolvedValue(mocks.poolClient),
    mocks.poolClient.query.mockReset(),
    mocks.poolClient.release.mockReset()
  );
const qOnce = (rows: unknown[]) => mocks.pool.query.mockResolvedValueOnce({ rows });
const qRowCount = (n: number) => mocks.pool.query.mockResolvedValueOnce({ rowCount: n });
const txClient = (row: Record<string, unknown>) => ({
  query: vi.fn().mockResolvedValue({ rows: [row] }),
});
const firstSql = () => mocks.pool.query.mock.calls[0][0] as string;
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
      [{ rows: [mockUserRecord({ id: 'u1', role: 'admin', created_at: new Date('2026-01-01') })] }],
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
describe('用户生命周期操作（anonymize）', () => {
  beforeEach(reset);
  it.each<[string, (id: string) => Promise<boolean>, number, boolean]>([
    ['anonymizeUser 应替换用户名并清空密码', anonymizeUser, 1, true],
    ['anonymizeUser 无匹配用户应返回 false', anonymizeUser, 0, false],
  ])('%s', async (_n, fn, rowCount, expected) => {
    qRowCount(rowCount);
    expect(await fn('user-123')).toBe(expected);
  });
  it('anonymizeUser 应使用 deleted_ 前缀和 password_hash =', async () => {
    qRowCount(1);
    await anonymizeUser('abcd-1234-efgh-5678');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringContaining('password_hash ='), [
      'abcd-1234-efgh-5678',
      'deleted_abcd1234',
    ]);
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
    expect(mocks.argon2.hash).toHaveBeenCalledWith(
      'pass123',
      expect.objectContaining({ type: 'argon2id', memoryCost: 65536, timeCost: 3 }),
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      expect.arrayContaining(['txuser', 'hashed-password', 'analyst', 'tx@test.com']),
    );
  });
  it.each([
    ['email 为 null 时应传入 null', 'nullemail', null, 'readonly'],
    ['默认角色应为 analyst', 'def', null, undefined],
  ] as const)('%s', async (_n, username, email, role) => {
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
describe('registerUser - 注册即创建个人组织（ADR-009）', () => {
  beforeEach(() => {
    setupTxPoolMocks();
    mocks.argon2.hash.mockResolvedValue('hashed-password');
  });
  it('应在单事务中创建用户 + 组织 + owner 成员并返回 userId', async () => {
    mocks.poolClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [mockUserRecord({ id: 'u1', role: 'analyst' })] })
      .mockResolvedValueOnce({ rows: [{ id: 'org-1' }] })
      .mockResolvedValueOnce({});
    expect(await registerUser('nu', 'pass123', 'new@test.com', 'Acme Corp')).toBe('u1');
    const sqls = mocks.poolClient.query.mock.calls.map((c) => String(c[0]));
    expect(['BEGIN', 'COMMIT'].every((s) => sqls.includes(s))).toBe(true);
    expect(sqls.some((s) => s.includes('INSERT INTO organizations'))).toBe(true);
    const membershipCall = mocks.poolClient.query.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO memberships'),
    );
    expect(membershipCall?.[0]).toContain("role) VALUES ($1, $2, 'owner')");
    expect(membershipCall?.[1]).toEqual(['org-1', 'u1']);
    expect(mocks.poolClient.release).toHaveBeenCalled();
  });
  it('组织 slug 由 orgName 派生并追加随机后缀', async () => {
    mocks.poolClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [mockUserRecord({ id: 'u1' })] })
      .mockResolvedValueOnce({ rows: [{ id: 'org-1' }] })
      .mockResolvedValueOnce({});
    await registerUser('nu', 'pass', 'e@t.com', 'Acme Corp');
    const orgCall = mocks.poolClient.query.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO organizations'),
    );
    expect(orgCall?.[1][1]).toBe('acme-corp-mocked-random-token');
  });
  it('唯一约束冲突时应回滚并抛出（由路由层映射为 409）', async () => {
    mocks.poolClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [mockUserRecord({ id: 'u1' })] })
      .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'));
    await expect(registerUser('nu', 'pass', 'e@t.com', 'Acme')).rejects.toThrow('duplicate key');
    expect(mocks.poolClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.poolClient.release).toHaveBeenCalled();
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
  beforeEach(setupTxPoolMocks);
  it.each([
    { name: '空字符串', token: '' },
    { name: '超过 256 字符的令牌', token: 'x'.repeat(257) },
  ])('$name 应返回 null', async ({ token }) => {
    expect(await verifyEmailToken(token)).toBeNull();
  });
  it.each([
    ['令牌不存在或已消费应返回 null', [{ rows: [] }], 'COMMIT', null],
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
