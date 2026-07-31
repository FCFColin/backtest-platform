import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import { mockUserRecord, mockUserRecordWithPassword } from '../../helpers/authFixtures.js';

const mocks = vi.hoisted(() => ({
  argon2: { hash: vi.fn(), verify: vi.fn(), argon2id: 'argon2id' },
  pool: { query: vi.fn(), connect: vi.fn() },
  poolClient: { query: vi.fn(), release: vi.fn() },
  crypto: {
    randomBytes: vi.fn(() => ({ toString: vi.fn(() => 'mocked-random-token') })),
    createHash: vi.fn(() => ({ update: vi.fn().mockReturnThis(), digest: vi.fn(() => 'mocked-sha256-hex') })),
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
  createUser, getUserById, getUserByEmail, deactivateUser, anonymizeUser, deleteUser, createUserTx,
} from '../../../packages/backend/src/repositories/userRepo.js';
import {
  verifyUser, issueEmailVerificationToken, verifyEmailToken,
} from '../../../packages/backend/src/application/auth/userService.js';

const reset = () => { vi.clearAllMocks(); mocks.argon2.hash.mockResolvedValue('hashed-password'); };
const qOnce = (rows: unknown[]) => mocks.pool.query.mockResolvedValueOnce({ rows });
const qRowCount = (n: number) => mocks.pool.query.mockResolvedValueOnce({ rowCount: n });
const txClient = (row: Record<string, unknown>) => ({ query: vi.fn().mockResolvedValue({ rows: [row] }) });
const firstSql = () => mocks.pool.query.mock.calls[0][0] as string;

describe('createUser - 用户创建', () => {
  beforeEach(() => { reset(); qOnce([mockUserRecord()]); });
  it.each([
    { name: 'argon2id 哈希密码', expected: { type: 'argon2id' } },
    { name: '64MB 内存成本', expected: { memoryCost: 65536 } },
    { name: '3 次迭代', expected: { timeCost: 3 } },
  ])('应使用 $name', async ({ expected }) => {
    await createUser('testuser', 'password123');
    expect(mocks.argon2.hash).toHaveBeenCalledWith('password123', expect.objectContaining(expected));
  });
  it.each([
    { name: '默认 analyst 角色', username: 'testuser', role: undefined, expectedRole: 'analyst' },
    { name: '指定 admin 角色', username: 'adminuser', role: 'admin', expectedRole: 'admin' },
    { name: '指定 readonly 角色', username: 'readonlyuser', role: 'readonly', expectedRole: 'readonly' },
  ])('应支持 $name', async ({ username, role, expectedRole }) => {
    await createUser(username, 'password123', role);
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([username, 'hashed-password', expectedRole]));
  });
  it('应返回正确的用户对象', async () => {
    expect(await createUser('testuser', 'password123', 'admin')).toEqual({
      id: 'user-123', username: 'testuser', role: 'analyst', createdAt: expect.any(Date), isActive: true,
    });
  });
  it('应使用参数化查询防止 SQL 注入', async () => {
    await createUser('testuser', 'password123');
    expect(firstSql()).toContain('$1');
    expect(firstSql()).toContain('$2');
    expect(firstSql()).toContain('$3');
  });
  it('SQL 注入用户名应作为参数传递（不拼接 SQL）', async () => {
    const malicious = "'; DROP TABLE users; --";
    await createUser(malicious, 'password123');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([malicious]));
  });
});

describe('边界与异常', () => {
  beforeEach(reset);
  it('空用户名应能传递到数据库层（由 DB 约束拒绝）', async () => {
    qOnce([mockUserRecord({ username: '', created_at: new Date() })]);
    expect((await createUser('', 'password')).username).toBe('');
  });
  it.each([
    { name: 'argon2.hash 异常', setup: () => mocks.argon2.hash.mockRejectedValueOnce(new Error('hash failed')), expected: 'hash failed' },
    { name: '数据库异常', setup: () => mocks.pool.query.mockRejectedValueOnce(new Error('DB connection failed')), expected: 'DB connection failed' },
    { name: '重复用户名（DB 唯一约束）', setup: () => mocks.pool.query.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint')), expected: 'duplicate key' },
  ])('$name 应向上抛出', async ({ setup, expected }) => {
    setup();
    await expect(createUser('testuser', 'password')).rejects.toThrow(expected);
  });
});

describe('verifyUser - 密码验证', () => {
  beforeEach(reset);
  it('正确密码应返回用户对象', async () => {
    qOnce([mockUserRecordWithPassword({ role: 'admin' })]);
    mocks.argon2.verify.mockResolvedValueOnce(true);
    const user = await verifyUser('testuser', 'correct-password');
    expect(user).not.toBeNull();
    expect(user).toMatchObject({ id: 'user-123', username: 'testuser', role: 'admin' });
  });
  it('错误密码应返回 null', async () => {
    qOnce([mockUserRecordWithPassword({ role: 'admin' })]);
    mocks.argon2.verify.mockResolvedValueOnce(false);
    expect(await verifyUser('testuser', 'wrong-password')).toBeNull();
  });
  it('不存在的用户应返回 null', async () => {
    qOnce([]);
    mocks.argon2.hash.mockResolvedValueOnce('dummy-hash');
    expect(await verifyUser('nonexistent', 'password')).toBeNull();
  });
  it('不存在的用户仍应执行 argon2.hash 防止时序攻击', async () => {
    qOnce([]);
    mocks.argon2.hash.mockResolvedValueOnce('dummy-hash');
    await verifyUser('nonexistent', 'password');
    expect(mocks.argon2.hash).toHaveBeenCalledWith('dummy-password', expect.objectContaining({ type: 'argon2id' }));
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
  it('仅查询 is_active=true 的用户', async () => {
    qOnce([]);
    mocks.argon2.hash.mockResolvedValueOnce('dummy');
    await verifyUser('inactive', 'password');
    expect(firstSql()).toContain('is_active = true');
  });
  it('SQL 注入用户名应作为参数传递', async () => {
    qOnce([]);
    mocks.argon2.hash.mockResolvedValueOnce('dummy');
    const malicious = "' OR '1'='1";
    await verifyUser(malicious, 'password');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([malicious]));
  });
});

describe('getUserById - 按 ID 查询', () => {
  beforeEach(reset);
  it('存在的用户 ID 应返回用户对象', async () => {
    qOnce([mockUserRecord({ role: 'admin' })]);
    expect(await getUserById('user-123')).toMatchObject({ id: 'user-123', username: 'testuser' });
  });
  it('不存在的用户 ID 应返回 null', async () => {
    qOnce([]);
    expect(await getUserById('nonexistent-id')).toBeNull();
  });
  it('应使用参数化查询', async () => {
    qOnce([]);
    await getUserById('user-123');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.any(String), ['user-123']);
  });
});

describe('getUserByEmail - 按邮箱查询', () => {
  beforeEach(reset);
  it('存在的邮箱应返回用户', async () => {
    qOnce([mockUserRecord({ id: 'u1', username: 'test', role: 'admin', created_at: new Date('2026-01-01') })]);
    const user = await getUserByEmail('test@example.com');
    expect(user!.id).toBe('u1');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringContaining('lower(email) = lower($1)'), ['test@example.com']);
  });
  it('不存在的邮箱应返回 null', async () => {
    qOnce([]);
    expect(await getUserByEmail('missing@test.com')).toBeNull();
  });
  it('应大小写不敏感查询', async () => {
    qOnce([mockUserRecord({ id: 'u2', username: 'CaseUser', created_at: new Date() })]);
    await getUserByEmail('CASE@TEST.COM');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringContaining('lower(email) = lower($1)'), expect.arrayContaining(['CASE@TEST.COM']));
  });
});

describe('deactivateUser - 用户停用', () => {
  beforeEach(reset);
  it.each([
    ['存在的活跃用户应被停用', 1, true],
    ['不存在的用户应返回 false', 0, false],
  ])('%s', async (_n, rowCount, expected) => {
    qRowCount(rowCount);
    expect(await deactivateUser('user-123')).toBe(expected);
  });
  it('应设置 is_active = false', async () => {
    qRowCount(1);
    await deactivateUser('user-123');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringContaining('is_active = false'), ['user-123']);
  });
});

describe('anonymizeUser - GDPR 匿名化', () => {
  beforeEach(reset);
  it.each([
    ['应替换用户名并清空密码', 1, true],
    ['无匹配用户应返回 false', 0, false],
  ])('%s', async (_n, rowCount, expected) => {
    qRowCount(rowCount);
    expect(await anonymizeUser('abcd-1234-efgh-5678')).toBe(expected);
  });
  it('应使用 deleted_ 前缀和 password_hash =', async () => {
    qRowCount(1);
    await anonymizeUser('abcd-1234-efgh-5678');
    expect(mocks.pool.query).toHaveBeenCalledWith(expect.stringContaining('password_hash ='), ['abcd-1234-efgh-5678', 'deleted_abcd1234']);
  });
});

describe('deleteUser - 物理删除', () => {
  beforeEach(reset);
  it.each([
    ['应执行 DELETE 并返回 true', 1, true],
    ['无匹配记录应返回 false', 0, false],
  ])('%s', async (_n, rowCount, expected) => {
    qRowCount(rowCount);
    expect(await deleteUser('user-123')).toBe(expected);
  });
  it('应使用 DELETE FROM users WHERE id = $1', async () => {
    qRowCount(1);
    await deleteUser('user-123');
    expect(mocks.pool.query).toHaveBeenCalledWith('DELETE FROM users WHERE id = $1', ['user-123']);
  });
});

describe('createUserTx - 事务内创建用户', () => {
  beforeEach(reset);
  it('应使用事务客户端插入并返回用户', async () => {
    const client = txClient(mockUserRecord({ id: 'u1', username: 'txuser', role: 'analyst', created_at: new Date('2026-01-01') }));
    const user = await createUserTx(client as never, 'txuser', 'pass123', 'tx@test.com', 'analyst');
    expect(user).toMatchObject({ id: 'u1', username: 'txuser', role: 'analyst', isActive: true });
    expect(mocks.argon2.hash).toHaveBeenCalledWith('pass123', expect.any(Object));
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), expect.arrayContaining(['txuser', 'hashed-password', 'analyst', 'tx@test.com']));
  });
  it('email 为 null 时应传入 null', async () => {
    const client = txClient(mockUserRecord({ id: 'u2', username: 'nullemail', role: 'readonly', created_at: new Date() }));
    await createUserTx(client as never, 'nullemail', 'pass', null, 'readonly');
    expect(client.query).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(['nullemail', 'hashed-password', 'readonly', null]));
  });
  it('默认角色应为 analyst', async () => {
    const client = txClient(mockUserRecord({ id: 'u3', username: 'def', role: 'analyst', created_at: new Date() }));
    expect((await createUserTx(client as never, 'def', 'pass', null)).role).toBe('analyst');
  });
});

describe('issueEmailVerificationToken - 签发邮箱验证令牌', () => {
  beforeEach(() => { reset(); mocks.pool.query.mockResolvedValue({ rowCount: 1 }); });
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
  it('令牌不存在或已消费应返回 null', async () => {
    mocks.poolClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(undefined);
    expect(await verifyEmailToken('valid-token')).toBeNull();
    expect(mocks.poolClient.query).toHaveBeenCalledWith('ROLLBACK');
  });
  it('令牌有效应验证并消费', async () => {
    mocks.poolClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'tok-1', user_id: 'user-1' }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    expect(await verifyEmailToken('valid-token')).toBe('user-1');
    expect(mocks.poolClient.query).toHaveBeenCalledWith('COMMIT');
  });
  it('数据库异常时应回滚并返回 null', async () => {
    mocks.poolClient.query.mockRejectedValueOnce(new Error('tx failed'));
    expect(await verifyEmailToken('valid-token')).toBeNull();
    expect(mocks.poolClient.release).toHaveBeenCalled();
  });
});