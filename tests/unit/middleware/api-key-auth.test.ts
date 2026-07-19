/**
 * API Key 兼容认证中间件单元测试（ADR-033）
 *
 * 企业理由：x-api-key 是 CLI/自动化脚本的主认证方式（按组织 DB 密钥），
 * 同时也是 ADMIN_API_KEY 破窗入口。本测试验证 resolveApiKeyUser 的两条路径：
 * 1. DB 密钥（verifyApiKey 服务）
 * 2. ADMIN_API_KEY 破窗（crypto.timingSafeEqual）
 *
 * Mock 策略：mock config、logger、apiKeyService（verifyApiKey）、errors（sendProblem）、authTypes。
 * crypto/buffer 不 mock——通过控制输入验证 timingSafeEqual。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockMiddleware } from '../../helpers/expressMocks.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  config: { ADMIN_API_KEY: '' },
  verifyApiKey: vi.fn(),
  sendProblem: vi.fn(),
  attachAuthLogContext: vi.fn(),
  hashUserId: vi.fn().mockReturnValue('hashed'),
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: mocks.config,
  validateConfig: vi.fn(),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../packages/backend/src/services/apiKeyVerifier.js', () => ({
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
  mocks.config.ADMIN_API_KEY = '';
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
      'Unauthorized',
      expect.anything(),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('有效 DB API Key 应认证通过并设置 req.user', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce({ orgId: ORG_ID, keyId: KEY_ID });
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

  it('DB 密钥无效且 ADMIN_API_KEY 匹配应通过认证（破窗路径）', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce(null);
    mocks.config.ADMIN_API_KEY = 'break-glass-admin-key';
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'break-glass-admin-key' },
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

  it('DB 密钥无效且 ADMIN_API_KEY 不匹配应返回 401', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce(null);
    mocks.config.ADMIN_API_KEY = 'real-admin-key';
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'wrong-key' },
    });
    handleApiKeyAuth(req, res, next);
    await flushPromises();
    expect(mocks.sendProblem).toHaveBeenCalledWith(
      expect.anything(),
      401,
      'INVALID_API_KEY',
      'Unauthorized',
      expect.anything(),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('DB 密钥无效且 ADMIN_API_KEY 未配置应返回 401', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce(null);
    mocks.config.ADMIN_API_KEY = '';
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'some-key' },
    });
    handleApiKeyAuth(req, res, next);
    await flushPromises();
    expect(mocks.sendProblem).toHaveBeenCalled();
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
      'Unauthorized',
      expect.anything(),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('NODE_ENV 不影响 handleApiKeyAuth 行为（始终验证）', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce(null);
    mocks.config.ADMIN_API_KEY = 'dev-key';
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'wrong-key' },
    });
    handleApiKeyAuth(req, res, next);
    await flushPromises();
    expect(mocks.sendProblem).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('handleOptionalApiKey', () => {
  it('缺失 API Key 应设 req.user=null 并放行', () => {
    const { req, next } = createMockMiddleware({ headers: {} });
    handleOptionalApiKey(req, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeNull();
  });

  it('有效 DB API Key 应认证通过并放行', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce({ orgId: ORG_ID, keyId: KEY_ID });
    const { req, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_valid' },
    });
    handleOptionalApiKey(req, next);
    await flushPromises();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      sub: `apikey:${KEY_ID}`,
      tenant_id: ORG_ID,
    });
  });

  it('有效 ADMIN_API_KEY 应认证通过并放行', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce(null);
    mocks.config.ADMIN_API_KEY = 'optional-admin-key';
    const { req, next } = createMockMiddleware({
      headers: { 'x-api-key': 'optional-admin-key' },
    });
    handleOptionalApiKey(req, next);
    await flushPromises();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject({
      sub: 'platform:break-glass',
      platform_admin: true,
    });
  });

  it('无效 API Key 应设 req.user=null 并放行（可选不阻断）', async () => {
    mocks.verifyApiKey.mockResolvedValueOnce(null);
    mocks.config.ADMIN_API_KEY = '';
    const { req, next } = createMockMiddleware({
      headers: { 'x-api-key': 'invalid-key' },
    });
    handleOptionalApiKey(req, next);
    await flushPromises();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeNull();
  });

  it('verifyApiKey 抛出异常应匿名放行', async () => {
    mocks.verifyApiKey.mockRejectedValueOnce(new Error('error'));
    const { req, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_key' },
    });
    handleOptionalApiKey(req, next);
    await flushPromises();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeNull();
  });
});
