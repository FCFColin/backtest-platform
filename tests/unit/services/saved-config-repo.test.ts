/**
 * savedConfigRepo 单元测试（LIMIT 行为 + 边界 + CRUD 返回）
 *
 * Mock 策略同 persistence-repos.test.ts：mock db.withTenant 直接执行回调。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTenant: vi.fn(),
}));

vi.mock('../../../api/db/index.js', () => ({
  withTenant: (tenantId: string, fn: (client: { query: typeof dbMocks.query }) => unknown) => {
    dbMocks.withTenant(tenantId);
    return fn({ query: dbMocks.query });
  },
}));

import {
  createConfig,
  listConfigs,
  getConfig,
  updateConfig,
  deleteConfig,
} from '../../../api/services/savedConfigRepo.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CONFIG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeEach(() => vi.clearAllMocks());

describe('savedConfigRepo LIMIT 行为', () => {
  it('listConfigs 应钳制 limit 上限为 200', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listConfigs(TENANT, 9999);
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(200);
  });

  it('listConfigs 默认 limit 应为 50', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listConfigs(TENANT);
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(50);
  });

  it('listConfigs limit 为 0 应传 0（不返回结果）', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listConfigs(TENANT, 0);
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(0);
  });
});

describe('savedConfigRepo 空数据库', () => {
  it('listConfigs 空数据库应返回空数组', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const r = await listConfigs(TENANT);
    expect(r).toEqual([]);
  });

  it('getConfig 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getConfig(TENANT, CONFIG_ID)).toBeNull();
  });
});

describe('savedConfigRepo CRUD 返回', () => {
  const baseRow = {
    id: CONFIG_ID,
    name: 'test-cfg',
    config: { tickers: ['SPY', 'QQQ'], startDate: '2024-01-01' },
    owner_user_id: 'u1',
    created_at: new Date('2026-06-01T00:00:00.000Z'),
    updated_at: new Date('2026-06-01T00:00:00.000Z'),
  };

  it('createConfig 应返回完整创建记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
    const r = await createConfig(TENANT, 'u1', {
      name: 'test-cfg',
      config: { tickers: ['SPY', 'QQQ'], startDate: '2024-01-01' },
    });
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(r).toMatchObject({
      id: CONFIG_ID,
      name: 'test-cfg',
      ownerUserId: 'u1',
    });
    expect(r.createdAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('createConfig 空 ownerUserId 应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{ ...baseRow, owner_user_id: null }],
    });
    const r = await createConfig(TENANT, null, {
      name: 'test-cfg',
      config: {},
    });
    expect(r.ownerUserId).toBeNull();
  });

  it('updateConfig 应返回更新后的完整记录', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{ ...baseRow, name: 'cfg-updated', config: { a: 2 } }],
    });
    const r = await updateConfig(TENANT, CONFIG_ID, {
      name: 'cfg-updated',
      config: { a: 2 },
    });
    expect(r).not.toBeNull();
    expect(r!.name).toBe('cfg-updated');
  });

  it('updateConfig 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const r = await updateConfig(TENANT, CONFIG_ID, { name: 'x', config: {} });
    expect(r).toBeNull();
  });

  it('deleteConfig 成功应返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteConfig(TENANT, CONFIG_ID)).toBe(true);
  });

  it('deleteConfig 不存在应返回 false', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deleteConfig(TENANT, CONFIG_ID)).toBe(false);
  });

  it('getConfig 成功应返回映射后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
    const r = await getConfig(TENANT, CONFIG_ID);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('test-cfg');
  });
});
