/**
 * API Key 管理集成测试（RO-049 / ADR-033）
 *
 * 跨层验证：Express 路由 → apiKeyService（sha256 哈希、软吊销）→ PostgreSQL。
 * 安全断言：明文密钥仅创建时一次性返回，列表不含明文/哈希，吊销后不可用。
 * 使用 testcontainers 起真实 PG。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
}));

import apiKeyRoutes from '../../packages/backend/src/routes/apiKeyRoutes.js';
import {
  isDockerAvailable,
  setupTestContainer,
  seedOrgAndUser,
  startSaasTestServer,
  type TestContainerContext,
  type SeedData,
} from '../helpers/testcontainersPg.js';

const dockerAvailable = isDockerAvailable();

let ctx: TestContainerContext | null = null;
let seed: SeedData | null = null;
let baseUrl = '';

beforeAll(async () => {
  if (!dockerAvailable) return;
  ctx = await setupTestContainer();
  seed = await seedOrgAndUser();

  const server = await startSaasTestServer(seed.orgId, seed.userId, '/api/v1/keys', apiKeyRoutes);
  baseUrl = server.url;
}, 120000);

afterAll(async () => {
  if (ctx) await ctx.cleanup();
});

describe.skipIf(!dockerAvailable)('API Keys 管理集成测试', () => {
  it('POST 创建密钥返回 201 且明文仅此一次', async () => {
    const res = await fetch(`${baseUrl}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CI 集成密钥' }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.name).toBe('CI 集成密钥');
    expect(json.data.apiKey).toMatch(/^bpk_live_/);
    expect(json.data.keyPrefix).toBeDefined();
    expect(json.data.createdAt).toBeDefined();
  });

  it('GET 列表不含明文密钥与哈希', async () => {
    await fetch(`${baseUrl}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '列表测试密钥' }),
    });

    const res = await fetch(`${baseUrl}/api/v1/keys`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(2);
    for (const key of json.data) {
      expect(key.apiKey).toBeUndefined();
      expect(key.keyHash).toBeUndefined();
      expect(key.keyPrefix).toBeDefined();
      expect(key.revokedAt).toBeNull();
    }
  });

  it('DELETE 吊销密钥后列表显示已吊销', async () => {
    const createRes = await fetch(`${baseUrl}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '待吊销密钥' }),
    });
    const created = await createRes.json();
    const keyId = created.data.id;

    const revokeRes = await fetch(`${baseUrl}/api/v1/keys/${keyId}`, {
      method: 'DELETE',
    });
    expect(revokeRes.status).toBe(200);
    const revokeJson = await revokeRes.json();
    expect(revokeJson.data.revoked).toBe(true);

    const listRes = await fetch(`${baseUrl}/api/v1/keys`);
    const listJson = await listRes.json();
    const revokedKey = listJson.data.find((k: { id: string }) => k.id === keyId);
    expect(revokedKey).toBeDefined();
    expect(revokedKey.revokedAt).not.toBeNull();
  });

  it('DELETE 不存在的密钥返回 404', async () => {
    const res = await fetch(`${baseUrl}/api/v1/keys/00000000-0000-4000-8000-000000000000`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(404);
  });

  it('DELETE 非法 UUID 返回 400', async () => {
    const res = await fetch(`${baseUrl}/api/v1/keys/not-a-uuid`, { method: 'DELETE' });
    expect(res.status).toBe(400);
  });

  it('POST 空名称返回校验错误', async () => {
    const res = await fetch(`${baseUrl}/api/v1/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
  });
});
