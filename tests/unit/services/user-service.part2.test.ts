/**
 * 用户服务测试 - 验证与查询（拆分自 user-service.test.ts Task 5.16）
 *
 * 企业理由：密码验证、按 ID/邮箱查询是用户服务的高频路径，正确性影响登录、
 * 用户管理、邮箱归一化等关键功能。
 *
 * 拆分原因：原文件 497 行超过单文件可读性阈值。
 * - part1：createUser + 边界异常
 * - part2（本文件）：verifyUser + getUserById + getUserByEmail
 * - part3：lifecycle + email verification
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import { mockUserRecord, mockUserRecordWithPassword } from '../../helpers/userFixtures.js';

const mocks = vi.hoisted(() => ({
  argon2: { hash: vi.fn(), verify: vi.fn(), argon2id: 'argon2id' },
  pool: { query: vi.fn() },
}));

vi.mock('argon2', () => ({ default: mocks.argon2, ...mocks.argon2 }));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({ getPool: () => mocks.pool }));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import {
  getUserById,
  getUserByEmail,
} from '../../../packages/backend/src/repositories/userRepo.js';
import { verifyUser } from '../../../packages/backend/src/services/userService.js';

describe('verifyUser - 密码验证', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('正确密码应返回用户对象', async () => {
    mocks.pool.query.mockResolvedValueOnce({
      rows: [mockUserRecordWithPassword({ role: 'admin' })],
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
      rows: [mockUserRecordWithPassword({ role: 'admin' })],
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
      .mockResolvedValueOnce({ rows: [mockUserRecordWithPassword({ role: 'admin' })] })
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
      rows: [mockUserRecordWithPassword({ role: 'admin' })],
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
      rows: [mockUserRecord({ role: 'admin' })],
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

describe('getUserByEmail - 按邮箱查询', () => {
  beforeEach(() => vi.clearAllMocks());

  it('存在的邮箱应返回用户', async () => {
    mocks.pool.query.mockResolvedValueOnce({
      rows: [
        mockUserRecord({
          id: 'u1',
          username: 'test',
          role: 'admin',
          created_at: new Date('2026-01-01'),
        }),
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
      rows: [mockUserRecord({ id: 'u2', username: 'CaseUser', created_at: new Date() })],
    });
    const user = await getUserByEmail('CASE@TEST.COM');
    expect(user).not.toBeNull();
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('lower(email) = lower($1)'),
      expect.arrayContaining(['CASE@TEST.COM']),
    );
  });
});
