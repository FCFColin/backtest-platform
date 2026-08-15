import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockMiddleware } from '../../helpers/expressMocks.js';
import '../../helpers/loggerMock.js';

const mocks = vi.hoisted(() => ({
  verifyApiKey: vi.fn(),
  sendProblem: vi.fn(),
  attachAuthLogContext: vi.fn(),
  hashUserId: vi.fn().mockReturnValue('hashed'),
}));

vi.mock('../../../packages/backend/src/infrastructure/apiKeyVerifier.js', () => ({
  verifyApiKey: mocks.verifyApiKey,
}));
vi.mock('../../../packages/backend/src/utils/errors.js', () => ({
  sendProblem: mocks.sendProblem,
}));

import { authenticateWithApiKey } from '../../../packages/backend/src/middleware/apiKeyAuth.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const KEY_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyApiKey.mockReset();
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('authenticateWithApiKey（必选模式）', () => {
  it.each([
    ['缺失 API Key 应直接返回（不断言、不阻断、不调 verifyApiKey）', {}, false],
    ['空字符串 API Key 应直接返回（同缺失，由下游中间件处理）', { 'x-api-key': '' }, false],
  ])('%s', (_n, headers, _unused) => {
    const { req, res, next } = createMockMiddleware({ headers });
    authenticateWithApiKey(req, res, next, false);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.sendProblem).not.toHaveBeenCalled();
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
  });
  it('超长 API Key（>128 字符）应返回 401', async () => {
    const { req, res, next } = createMockMiddleware({ headers: { 'x-api-key': 'x'.repeat(129) } });
    authenticateWithApiKey(req, res, next, false);
    await flushPromises();
    expect(mocks.sendProblem).toHaveBeenCalledWith(expect.anything(), 401, 'INVALID_API_KEY');
    expect(next).not.toHaveBeenCalled();
  });
  it.each([
    [
      '有效 DB API Key 应认证通过并设置 req.user（租户密钥路径）',
      { orgId: ORG_ID, keyId: KEY_ID, isPlatformAdmin: false },
      { sub: `apikey:${KEY_ID}`, role: 'analyst', tenant_id: ORG_ID },
    ],
    [
      '平台 break-glass 密钥应注入 platform_admin 角色（P0-04）',
      { orgId: null, keyId: KEY_ID, isPlatformAdmin: true },
      { sub: 'platform:break-glass', role: 'admin', platform_admin: true },
    ],
    ['无效 API Key（verifyApiKey 返回 null）应返回 401', null, null],
  ])('%s', async (_n, verified, expected) => {
    mocks.verifyApiKey.mockResolvedValueOnce(verified);
    const { req, res, next } = createMockMiddleware({ headers: { 'x-api-key': 'bpk_live_key' } });
    authenticateWithApiKey(req, res, next, false);
    await flushPromises();
    if (expected) {
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toMatchObject(expected);
      expect(mocks.sendProblem).not.toHaveBeenCalled();
    } else {
      expect(mocks.sendProblem).toHaveBeenCalledWith(expect.anything(), 401, 'INVALID_API_KEY');
      expect(next).not.toHaveBeenCalled();
    }
  });
  // D4-010 / DADR-045：基础设施错误（Redis/DB）fail-closed 503，不再静默吞掉返回 401
  it('verifyApiKey 抛出异常应返回 503 AUTH_SERVICE_UNAVAILABLE（fail-closed）（D4-010）', async () => {
    mocks.verifyApiKey.mockRejectedValueOnce(new Error('DB connection error'));
    const { req, res, next } = createMockMiddleware({ headers: { 'x-api-key': 'bpk_live_key' } });
    authenticateWithApiKey(req, res, next, false);
    await flushPromises();
    expect(mocks.sendProblem).toHaveBeenCalledWith(
      expect.anything(),
      503,
      'AUTH_SERVICE_UNAVAILABLE',
      'Authentication Service Unavailable',
      expect.objectContaining({ detail: expect.any(String) }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authenticateWithApiKey（可选模式）', () => {
  it('缺失 API Key 应设 req.user=null 并放行', async () => {
    const { req, res, next } = createMockMiddleware({ headers: {} });
    await authenticateWithApiKey(req as AuthenticatedRequest, res, next, true);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeNull();
  });
  it.each([
    [
      '有效 DB API Key 应认证通过并放行（租户密钥路径）',
      { orgId: ORG_ID, keyId: KEY_ID, isPlatformAdmin: false },
      { sub: `apikey:${KEY_ID}`, tenant_id: ORG_ID },
    ],
    [
      '平台 break-glass 密钥应认证通过并放行（P0-04）',
      { orgId: null, keyId: KEY_ID, isPlatformAdmin: true },
      { sub: 'platform:break-glass', platform_admin: true },
    ],
    ['无效 API Key 应设 req.user=null 并放行（可选不阻断）', null, null],
  ])('%s', async (_n, verified, expected) => {
    mocks.verifyApiKey.mockResolvedValueOnce(verified);
    const { req, res, next } = createMockMiddleware({ headers: { 'x-api-key': 'bpk_live_key' } });
    await authenticateWithApiKey(req as AuthenticatedRequest, res, next, true);
    expect(next).toHaveBeenCalledTimes(1);
    if (expected) expect(req.user).toMatchObject(expected);
    else expect(req.user).toBeNull();
  });
  // D4-010 / DADR-045：基础设施错误 fail-closed 503，不再匿名放行（安全优先）
  it('verifyApiKey 抛出异常应返回 503 AUTH_SERVICE_UNAVAILABLE（fail-closed）（D4-010）', async () => {
    mocks.verifyApiKey.mockRejectedValueOnce(new Error('DB connection failed'));
    const { req, res, next } = createMockMiddleware({ headers: { 'x-api-key': 'bpk_live_key' } });
    await authenticateWithApiKey(req as AuthenticatedRequest, res, next, true);
    expect(mocks.sendProblem).toHaveBeenCalledWith(
      res,
      503,
      'AUTH_SERVICE_UNAVAILABLE',
      'Authentication Service Unavailable',
      expect.objectContaining({ detail: expect.any(String) }),
    );
    expect(next).not.toHaveBeenCalled();
  });
  // P0-04：超时保护——resolveApiKeyUser 挂起 5s 后返回 504
  it('resolveApiKeyUser 超时应返回 504 Gateway Timeout（P0-04）', async () => {
    mocks.verifyApiKey.mockReturnValueOnce(new Promise(() => {}));
    const { req, res, next } = createMockMiddleware({
      headers: { 'x-api-key': 'bpk_live_hanging' },
    });
    vi.useFakeTimers();
    const promise = authenticateWithApiKey(req as AuthenticatedRequest, res, next, true);
    vi.advanceTimersByTime(5000); // 快进 5s 触发超时
    await promise;
    vi.useRealTimers();
    expect(mocks.sendProblem).toHaveBeenCalledWith(
      res,
      504,
      'GATEWAY_TIMEOUT',
      'API Key Resolution Timeout',
      expect.objectContaining({ detail: expect.stringContaining('5 seconds') }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
