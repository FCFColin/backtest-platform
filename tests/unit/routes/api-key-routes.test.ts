/**
 * 按组织 API Key 管理路由单元测试（ADR-033）
 *
 * 企业理由：API Key 管理端点直接控制高权限凭证的生命周期，必须验证：
 * 1. 创建返回 201 + 一次性明文（仅此响应可见）
 * 2. 列表返回元数据（不含明文）
 * 3. 吊销对非法 ID 返回 400、不存在返回 404、成功返回 200
 *
 * Mock 策略：mock apiKeyService（隔离 DB），在测试 app 内注入 req.tenantId/req.user
 * 模拟前置鉴权链（jwtAuth→resolveTenant→requireTenant→requirePermission）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';

import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  service: {
    createApiKey: vi.fn(),
    listApiKeys: vi.fn(),
    revokeApiKey: vi.fn(),
  },
}));

vi.mock('../../../packages/backend/src/repositories/apiKeyRepo.js', () => mocks.service);

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import apiKeyRoutes from '../../../packages/backend/src/routes/apiKeyRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const KEY_ID = '22222222-2222-2222-2222-222222222222';

describe('apiKeyRoutes', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startExpressApp((app) => {
      // 模拟鉴权链：注入活跃租户与用户
      app.use((req: TestRequest, _res, next) => {
        req.tenantId = ORG;
        req.user = { sub: 'user-1', role: 'admin', tenant_id: ORG, org_role: 'admin' };
        next();
      });
      app.use('/api/v1/keys', apiKeyRoutes);
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST / 创建成功应返回 201 与一次性明文', async () => {
    mocks.service.createApiKey.mockResolvedValueOnce({
      id: KEY_ID,
      orgId: ORG,
      name: 'CI key',
      keyPrefix: 'bpk_live_abcd',
      createdAt: '2026-01-01T00:00:00.000Z',
      plaintext: 'bpk_live_secretplaintext',
    });
    const res = await fetch(`${server.url}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CI key' }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.apiKey).toBe('bpk_live_secretplaintext');
    expect(mocks.service.createApiKey).toHaveBeenCalledWith(ORG, 'CI key', 'user-1');
  });

  it('POST / 名称为空应返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
    expect(mocks.service.createApiKey).not.toHaveBeenCalled();
  });

  it('GET / 应返回组织密钥列表', async () => {
    mocks.service.listApiKeys.mockResolvedValueOnce([
      { id: KEY_ID, orgId: ORG, name: 'CI key', keyPrefix: 'bpk_live_abcd', revokedAt: null },
    ]);
    const res = await fetch(`${server.url}/api/v1/keys`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(mocks.service.listApiKeys).toHaveBeenCalledWith(ORG);
  });

  it('DELETE /:id 非法 UUID 应返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/keys/not-a-uuid`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(mocks.service.revokeApiKey).not.toHaveBeenCalled();
  });

  it('DELETE /:id 不存在应返回 404', async () => {
    mocks.service.revokeApiKey.mockResolvedValueOnce(false);
    const res = await fetch(`${server.url}/api/v1/keys/${KEY_ID}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('DELETE /:id 成功应返回 200', async () => {
    mocks.service.revokeApiKey.mockResolvedValueOnce(true);
    const res = await fetch(`${server.url}/api/v1/keys/${KEY_ID}`, { method: 'DELETE' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.revoked).toBe(true);
    expect(mocks.service.revokeApiKey).toHaveBeenCalledWith(ORG, KEY_ID);
  });

  it('POST / 服务端错误应返回 500', async () => {
    mocks.service.createApiKey.mockRejectedValueOnce(new Error('DB connection failed'));
    const res = await fetch(`${server.url}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CI key' }),
    });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('API_KEY_CREATE_FAILED');
  });

  it('GET / 服务端错误应返回 500', async () => {
    mocks.service.listApiKeys.mockRejectedValueOnce(new Error('DB connection failed'));
    const res = await fetch(`${server.url}/api/v1/keys`);
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('API_KEY_LIST_FAILED');
  });

  it('DELETE /:id 服务端错误应返回 500', async () => {
    mocks.service.revokeApiKey.mockRejectedValueOnce(new Error('DB connection failed'));
    const res = await fetch(`${server.url}/api/v1/keys/${KEY_ID}`, { method: 'DELETE' });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('API_KEY_REVOKE_FAILED');
  });
});
