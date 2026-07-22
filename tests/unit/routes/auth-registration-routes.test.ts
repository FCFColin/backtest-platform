/**
 * authRegistrationRoutes 单元测试 — POST /register / /verify-email / /resend-verification
 *
 * 覆盖：注册成功/EMAIL_TAKEN/duplicate key/500、verify-email 缺 token/无效 token/成功、
 * resend-verification 缺 email/成功。
 *
 * Mock 策略：mock jwtAuth（注入 req.user）/getUserByEmail/createUserTx/getClient/
 * issueEmailVerificationToken/verifyEmailToken/sendVerificationEmail/logger。
 * 不 mock requireUser/hashUserId/validate/registerSchema/sendProblem，保留真实业务逻辑。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { mockLogger } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  jwtAuth: vi.fn((req: Request, _res: Response, next: NextFunction) => {
    // 模拟已认证用户（/resend-verification 需要）
    (req as Request & { user?: unknown }).user = {
      sub: 'user-123',
      role: 'admin',
      iat: 1,
      exp: 9999999999,
    };
    next();
  }),
  getUserByEmail: vi.fn(),
  createUserTx: vi.fn(),
  getClient: vi.fn(),
  issueEmailVerificationToken: vi.fn(),
  verifyEmailToken: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../packages/backend/src/middleware/jwtAuth.js', () => ({
  jwtAuth: mocks.jwtAuth,
}));

vi.mock('../../../packages/backend/src/repositories/userRepo.js', () => ({
  getUserByEmail: mocks.getUserByEmail,
  createUserTx: mocks.createUserTx,
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getClient: mocks.getClient,
}));

vi.mock('../../../packages/backend/src/application/auth/userService.js', () => ({
  issueEmailVerificationToken: mocks.issueEmailVerificationToken,
  verifyEmailToken: mocks.verifyEmailToken,
}));

vi.mock('../../../packages/backend/src/infrastructure/mailService.js', () => ({
  sendVerificationEmail: mocks.sendVerificationEmail,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mockLogger(loggerMocks),
}));

import authRegistrationRoutes from '../../../packages/backend/src/routes/authRegistrationRoutes.js';

function makeClient(overrides: Record<string, unknown> = {}) {
  const query = vi.fn();
  // 默认：BEGIN/INSERT organizations/INSERT memberships/COMMIT 都成功
  query
    .mockResolvedValueOnce({}) // BEGIN
    .mockResolvedValueOnce({ rows: [{ id: 'org-uuid-123' }] }) // INSERT organizations RETURNING id
    .mockResolvedValueOnce({}) // INSERT memberships
    .mockResolvedValueOnce({}); // COMMIT
  return {
    query,
    release: vi.fn(),
    ...overrides,
  };
}

const validRegisterBody = {
  username: 'newuser',
  email: 'new@example.com',
  password: 'secret123',
  orgName: 'Acme Inc',
};

describe('authRegistrationRoutes', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.getUserByEmail.mockResolvedValue(null);
    mocks.createUserTx.mockResolvedValue({
      id: 'user-uuid-123',
      username: 'newuser',
      role: 'admin',
      createdAt: new Date(),
      isActive: true,
    });
    mocks.getClient.mockResolvedValue(makeClient());
    mocks.issueEmailVerificationToken.mockResolvedValue('token-abc');
    mocks.verifyEmailToken.mockResolvedValue('user-uuid-123');
    mocks.sendVerificationEmail.mockResolvedValue(undefined);
    server = await startExpressApp((app) => app.use('/api/v1/auth', authRegistrationRoutes));
  });

  afterEach(async () => {
    await server.close();
  });

  describe('POST /register', () => {
    it('注册成功应返回 201 + userId，事务正确提交且发送验证邮件', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterBody),
      });
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.userId).toBe('user-uuid-123');
      // 事务顺序：BEGIN → INSERT org → INSERT membership → COMMIT
      // getClient 返回 Promise<client>，需 await 取出 client 实例
      const client = await mocks.getClient.mock.results[0].value;
      const calls = client.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls).toContain('COMMIT');
      expect(calls.some((s: string) => String(s).includes('INSERT INTO organizations'))).toBe(true);
      expect(calls.some((s: string) => String(s).includes('INSERT INTO memberships'))).toBe(true);
      // 验证邮件已发送
      expect(mocks.issueEmailVerificationToken).toHaveBeenCalledWith('user-uuid-123');
      expect(mocks.sendVerificationEmail).toHaveBeenCalledWith('new@example.com', 'token-abc');
      // client.release 被调用（finally）
      expect(client.release).toHaveBeenCalled();
    });

    it('邮箱已被注册应返回 409 EMAIL_TAKEN，不进入事务', async () => {
      mocks.getUserByEmail.mockResolvedValueOnce({
        id: 'existing-user',
        username: 'existing',
        role: 'analyst',
        createdAt: new Date(),
        isActive: true,
      });

      const res = await fetch(`${server.url}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterBody),
      });
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error.code).toBe('EMAIL_TAKEN');
      expect(mocks.getClient).not.toHaveBeenCalled();
    });

    it('事务中唯一约束冲突应返回 409 ACCOUNT_CONFLICT 并 ROLLBACK', async () => {
      const conflictErr = Object.assign(
        new Error('duplicate key value violates unique constraint'),
        {
          code: '23505',
        },
      );
      const client = makeClient();
      // INSERT organizations 抛 duplicate key
      client.query
        .mockReset()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(conflictErr); // INSERT organizations 失败
      mocks.getClient.mockResolvedValueOnce(client);

      const res = await fetch(`${server.url}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterBody),
      });
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error.code).toBe('ACCOUNT_CONFLICT');
      // ROLLBACK 被调用
      const calls = client.query.mock.calls.map((c: unknown[]) => c[0]);
      expect(calls).toContain('ROLLBACK');
      // 验证邮件不应被发送
      expect(mocks.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('事务中其他异常应返回 500 REGISTER_FAILED 并 ROLLBACK', async () => {
      const client = makeClient();
      client.query
        .mockReset()
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('connection lost')); // INSERT organizations 失败
      mocks.getClient.mockResolvedValueOnce(client);

      const res = await fetch(`${server.url}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterBody),
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.error.code).toBe('REGISTER_FAILED');
      expect(loggerMocks.error).toHaveBeenCalled();
    });

    it('验证邮件发送失败不应阻塞注册成功', async () => {
      mocks.sendVerificationEmail.mockRejectedValueOnce(new Error('smtp down'));

      const res = await fetch(`${server.url}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRegisterBody),
      });

      expect(res.status).toBe(201);
      expect(loggerMocks.warn).toHaveBeenCalled();
    });
  });

  describe('POST /verify-email', () => {
    it('缺 token 应返回 422 MISSING_TOKEN', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error.code).toBe('MISSING_TOKEN');
      expect(mocks.verifyEmailToken).not.toHaveBeenCalled();
    });

    it('无效 token 应返回 400 INVALID_OR_EXPIRED_TOKEN', async () => {
      mocks.verifyEmailToken.mockResolvedValueOnce(null);

      const res = await fetch(`${server.url}/api/v1/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid-token' }),
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('有效 token 应返回 200 + verified:true', async () => {
      mocks.verifyEmailToken.mockResolvedValueOnce('user-uuid-456');

      const res = await fetch(`${server.url}/api/v1/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'valid-token' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ userId: 'user-uuid-456', verified: true });
      expect(mocks.verifyEmailToken).toHaveBeenCalledWith('valid-token');
    });
  });

  describe('POST /resend-verification', () => {
    it('缺 email 应返回 422 MISSING_EMAIL（jwtAuth 已通过）', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(body.error.code).toBe('MISSING_EMAIL');
      // jwtAuth 已通过（mock 注入了 req.user）
      expect(mocks.jwtAuth).toHaveBeenCalled();
      expect(mocks.issueEmailVerificationToken).not.toHaveBeenCalled();
    });

    it('有 email 应签发 token 并发送验证邮件，返回成功', async () => {
      const res = await fetch(`${server.url}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'me@example.com' }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(mocks.issueEmailVerificationToken).toHaveBeenCalledWith('user-123');
      expect(mocks.sendVerificationEmail).toHaveBeenCalledWith('me@example.com', 'token-abc');
    });
  });
});
