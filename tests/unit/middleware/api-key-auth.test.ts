/**
 * API Key 认证中间件单元测试（ADR-033 + P0-04）
 *
 * 企业理由：x-api-key 是 CLI/自动化脚本的主认证方式（按组织 DB 密钥），
 * 同时也是平台 break-glass 入口。P0-04 后两条路径统一走 DB（verifyApiKey）：
 * 1. 按组织 DB 密钥（is_platform_admin=FALSE）——注入租户上下文
 * 2. 平台 break-glass DB 密钥（is_platform_admin=TRUE）——注入 platform_admin 角色
 *
 * Mock 策略：mock logger、apiKeyVerifier（verifyApiKey）、errors（sendProblem）、authTypes。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockMiddleware } from '../../helpers/expressMocks.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';
import type { AuthenticatedRequest } from '../../../packages/backend/src/middleware/authTypes.js';

const mocks = vi.hoisted(() => ({
  verifyApiKey: vi.fn(),
  sendProblem: vi.fn(),
  attachAuthLogContext: vi.fn(),
  hashUserId: vi.fn().mockReturnValue('hashed'),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../packages/backend/src/infrastructure/apiKeyVerifier.js', () => ({
  verifyApiKey: mocks.verifyApiKey,
}));

vi.mock('../../../packages/backend/src/utils/errors.js', () => ({
  sendProblem: mocks.sendProblem,
}));

vi.mock('../../../packages/backend/src/middleware/authTypes.js', () => ({
  ACCESS_TOKEN_EXPIRES_IN_SEC: 900,
  attachAuthLogContext: mocks.attachAuthLogContext,
  hashUserId: mocks.hashUserId,
}));

import {
  handleApiKeyAuth,
  handleOptionalApiKey,
} from '../../../packages/backend/src/middleware/apiKeyAuth.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const KEY_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyApiKey.mockReset();
});

/**
 * 等待 Promise 微任务队列 flush（handleApiKeyAuth 使用 .then() 而非 await）
 */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('handleApiKeyAuth', () => {
  it('缺失 API Key 应直接返回（不断言、不阻断、不调 verifyApiKey）', () => {
    const { req, res, next } = createMockMiddleware({ headers: {} });
    handleApiKeyAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.sendProblem).not.toHaveBeenCalled();
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('空字符串 API Key 应直接返回（同缺失，由下游中间件处理）', () => {
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': '' },
    });
    handleApiKeyAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.sendProblem).not.toHaveBeenCalled();
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
  });

  it('超长 API Key（>128 字符）应返回 401', async () => {
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'x'.repeat(129) },
    });
    handleApiKeyAuth(req, res, next);
    await flushPromises();
    expect(mocks.sendProblem).toHaveBeenCalledWith(
      expect.anything(),
      401,
      'INVALID_API_KEY',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('有效 DB API Key 应认证通过并设置 req.user（租户密钥路径）', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce({
      orgId: ORG_ID,
      keyId: KEY_ID,
      isPlatformAdmin: false,
    });
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_validkey123' },
    });
    handleApiKeyAuth(req, res, next);
    await flushPromises();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      sub: `apikey:${KEY_ID}`,
      role: 'analyst',
      tenant_id: ORG_ID,
    });
    expect(mocks.sendProblem).not.toHaveBeenCalled();
  });

  it('平台 break-glass 密钥应注入 platform_admin 角色（P0-04）', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce({
      orgId: null,
      keyId: KEY_ID,
      isPlatformAdmin: true,
    });
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_breakglasskey' },
    });
    handleApiKeyAuth(req, res, next);
    await flushPromises();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      sub: 'platform:break-glass',
      role: 'admin',
      platform_admin: true,
    });
    expect(mocks.sendProblem).not.toHaveBeenCalled();
  });

  it('无效 API Key（verifyApiKey 返回 null）应返回 401', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce(null);
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_wrongkey' },
    });
    handleApiKeyAuth(req, res, next);
    await flushPromises();
    expect(mocks.sendProblem).toHaveBeenCalledWith(
      expect.anything(),
      401,
      'INVALID_API_KEY',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('verifyApiKey 抛出异常应返回 401', async () => {
    mocks.verifyApiKey.mockRejectedValueOnce(new Error('DB connection error'));
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_key' },
    });
    handleApiKeyAuth(req, res, next);
    await flushPromises();
    expect(mocks.sendProblem).toHaveBeenCalledWith(
      expect.anything(),
      401,
      'INVALID_API_KEY',
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('handleOptionalApiKey', () => {
  it('缺失 API Key 应设 req.user=null 并放行', async () => {
    const { req, res, next } = createMockMiddleware({ headers: {} });
    await handleOptionalApiKey(req as AuthenticatedRequest, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeNull();
  });

  it('有效 DB API Key 应认证通过并放行（租户密钥路径）', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce({
      orgId: ORG_ID,
      keyId: KEY_ID,
      isPlatformAdmin: false,
    });
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_valid' },
    });
    await handleOptionalApiKey(req as AuthenticatedRequest, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      sub: `apikey:${KEY_ID}`,
      tenant_id: ORG_ID,
    });
  });

  it('平台 break-glass 密钥应认证通过并放行（P0-04）', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce({
      orgId: null,
      keyId: KEY_ID,
      isPlatformAdmin: true,
    });
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_breakglass' },
    });
    await handleOptionalApiKey(req as AuthenticatedRequest, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      sub: 'platform:break-glass',
      platform_admin: true,
    });
  });

  it('无效 API Key 应设 req.user=null 并放行（可选不阻断）', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce(null);
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_invalid' },
    });
    await handleOptionalApiKey(req as AuthenticatedRequest, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeNull();
  });

  // P0-04：修复前 verifyApiKey 抛异常会 fire-and-forget 导致 unhandledRejection
  // 修复后：resolveApiKeyUser 内部 catch 返回 null → handleOptionalApiKey 匿名放行
  // （resolveApiKeyUser 自身有 try/catch，将 verifyApiKey 异常转为 null 返回）
  it('verifyApiKey 抛出异常应匿名放行（resolveApiKeyUser 内部 catch）（P0-04）', async () => {
    mocks.verifyApiKey.mockRejectedValueOnce(new Error('DB connection failed'));
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_key' },
    });
    await handleOptionalApiKey(req as AuthenticatedRequest, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // 无参数=匿名放行
    expect(req.user).toBeNull();
  });

  // P0-04：超时保护——resolveApiKeyUser 挂起 5s 后返回 504
  it('resolveApiKeyUser 超时应返回 504 Gateway Timeout（P0-04）', async () => {
    // 模拟 verifyApiKey 永不 resolve（挂起）
    mocks.verifyApiKey.mockReturnValueOnce(new Promise(() => {}));
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_hanging' },
    });

    // 使用 fake timers 加速超时
    vi.useFakeTimers();
    const promise = handleOptionalApiKey(req as AuthenticatedRequest, res, next);
    // 快进 5s 触发超时
    vi.advanceTimersByTime(5000);
    await promise;
    vi.useRealTimers();

    expect(mocks.sendProblem).toHaveBeenCalledWith(
      res,
      504,
      'GATEWAY_TIMEOUT',
      'API Key Resolution Timeout',
      expect.objectContaining({
        detail: expect.stringContaining('5 seconds'),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
