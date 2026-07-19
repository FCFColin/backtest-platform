/**
 * 按组织 API Key 服务单元测试（ADR-033）
 *
 * 企业理由：API Key 是服务端到服务端的高权限凭证。本测试验证：
 * 1. 创建仅存储哈希、明文一次性返回、前缀正确（不泄露可重建信息）
 * 2. 校验拒绝非法形态/已吊销密钥，命中后异步更新 last_used_at
 * 3. 吊销以 org_id 收敛（防跨租户），幂等返回布尔
 *
 * Mock 策略：mock db.getPool().query，避免真实数据库依赖。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: dbMocks.query }),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../../../packages/backend/src/repositories/apiKeyRepo.js';
import { verifyApiKey } from '../../../packages/backend/src/services/apiKeyVerifier.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const KEY_ID = '22222222-2222-2222-2222-222222222222';

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: KEY_ID,
    org_id: ORG,
    name: 'CI key',
    key_prefix: 'bpk_live_abcd',
    created_by: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    last_used_at: null,
    revoked_at: null,
    ...overrides,
  };
}

describe('createApiKey', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应返回一次性明文密钥且形态为 bpk_live_*', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [dbRow()] });
    const created = await createApiKey(ORG, 'CI key', null);

    expect(created.plaintext).toMatch(/^bpk_live_[A-Za-z0-9_-]+$/);
    expect(created.id).toBe(KEY_ID);
    expect(created.orgId).toBe(ORG);

    // 关键安全断言：写入 DB 的是哈希而非明文
    const [, params] = dbMocks.query.mock.calls[0];
    const keyHash = params[2] as string;
    expect(keyHash).not.toContain(created.plaintext);
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/);
    // key_prefix 是明文前缀，不含完整密钥
    expect(created.plaintext.startsWith(params[3] as string)).toBe(true);
  });
});

describe('verifyApiKey', () => {
  beforeEach(() => vi.clearAllMocks());

  it('非 bpk_live_ 前缀应直接拒绝（不查询 DB）', async () => {
    const result = await verifyApiKey('not-a-valid-key');
    expect(result).toBeNull();
    expect(dbMocks.query).not.toHaveBeenCalled();
  });

  it('超长密钥应直接拒绝', async () => {
    const result = await verifyApiKey('bpk_live_' + 'a'.repeat(200));
    expect(result).toBeNull();
    expect(dbMocks.query).not.toHaveBeenCalled();
  });

  it('未命中（无有效行）应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const result = await verifyApiKey('bpk_live_validlookingkey');
    expect(result).toBeNull();
  });

  it('命中应返回 orgId/keyId 并异步更新 last_used_at', async () => {
    dbMocks.query
      .mockResolvedValueOnce({ rows: [{ id: KEY_ID, org_id: ORG }] }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE last_used_at
    const result = await verifyApiKey('bpk_live_validlookingkey');
    expect(result).toEqual({ orgId: ORG, keyId: KEY_ID });
    // 等待异步 UPDATE
    await new Promise((r) => setTimeout(r, 5));
    expect(dbMocks.query).toHaveBeenCalledTimes(2);
  });
});

describe('listApiKeys', () => {
  beforeEach(() => vi.clearAllMocks());

  it('应映射数据库行为 ApiKeyRecord（不含明文/哈希）', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [dbRow()] });
    const keys = await listApiKeys(ORG);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ id: KEY_ID, orgId: ORG, keyPrefix: 'bpk_live_abcd' });
    expect((keys[0] as Record<string, unknown>).plaintext).toBeUndefined();
  });
});

describe('revokeApiKey', () => {
  beforeEach(() => vi.clearAllMocks());

  it('成功吊销应返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await revokeApiKey(ORG, KEY_ID)).toBe(true);
  });

  it('不存在/不属于本组织/已吊销应返回 false', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await revokeApiKey(ORG, KEY_ID)).toBe(false);
  });

  it('吊销应以 org_id 收敛防跨租户', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    await revokeApiKey(ORG, KEY_ID);
    const [sql, params] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('org_id = $2');
    expect(params).toEqual([KEY_ID, ORG]);
  });
});
