/**
 * 租户作用域仓储单元测试（ADR-034）
 *
 * 企业理由：这些仓储是 RLS 隔离的写入面。本测试验证：
 * 1. 所有读写都经 withTenant（即激活租户上下文，RLS 生效）
 * 2. SQL 行映射正确、JSONB 序列化正确
 * 3. 不存在记录时返回 null/false 的边界
 *
 * Mock 策略：mock db.withTenant —— 直接以 fake client 执行回调，捕获 SQL/params。
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
  listPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  getPortfolio,
} from '../../../api/services/portfolioRepo.js';
import {
  createConfig,
  listConfigs,
  getConfig,
  updateConfig,
  deleteConfig,
} from '../../../api/services/savedConfigRepo.js';
import { createRun, listRuns, getRun, deleteRun } from '../../../api/services/backtestRunRepo.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => vi.clearAllMocks());

describe('portfolioRepo', () => {
  it('listPortfolios 应经 withTenant 并映射行', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: '60/40',
          assets: [{ ticker: 'SPY', weight: 60 }],
          rebalance_frequency: 'monthly',
          owner_user_id: 'u1',
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-02'),
        },
      ],
    });
    const result = await listPortfolios(TENANT);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(result[0]).toMatchObject({ id: ID, name: '60/40', rebalanceFrequency: 'monthly' });
    expect(result[0].assets).toEqual([{ ticker: 'SPY', weight: 60 }]);
  });

  it('createPortfolio 应序列化 assets 为 JSONB 参数', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: 'X',
          assets: [{ ticker: 'QQQ', weight: 100 }],
          rebalance_frequency: 'none',
          owner_user_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    await createPortfolio(TENANT, null, { name: 'X', assets: [{ ticker: 'QQQ', weight: 100 }] });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(TENANT);
    expect(params[3]).toBe(JSON.stringify([{ ticker: 'QQQ', weight: 100 }]));
    expect(params[4]).toBe('none');
  });

  it('updatePortfolio 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const r = await updatePortfolio(TENANT, ID, {
      name: 'X',
      assets: [{ ticker: 'A', weight: 100 }],
    });
    expect(r).toBeNull();
  });

  it('deletePortfolio 应按 rowCount 返回布尔', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deletePortfolio(TENANT, ID)).toBe(true);
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deletePortfolio(TENANT, ID)).toBe(false);
  });

  it('getPortfolio 成功应返回映射后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: 'P',
          assets: [{ ticker: 'SPY', weight: 100 }],
          rebalance_frequency: 'monthly',
          owner_user_id: 'u1',
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-02'),
        },
      ],
    });
    const r = await getPortfolio(TENANT, ID);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('P');
  });

  it('getPortfolio 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getPortfolio(TENANT, ID)).toBeNull();
  });

  it('updatePortfolio 成功应返回更新后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: 'P2',
          assets: [{ ticker: 'QQQ', weight: 100 }],
          rebalance_frequency: 'quarterly',
          owner_user_id: 'u1',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const r = await updatePortfolio(TENANT, ID, {
      name: 'P2',
      assets: [{ ticker: 'QQQ', weight: 100 }],
      rebalanceFrequency: 'quarterly',
    });
    expect(r).not.toBeNull();
    expect(r!.name).toBe('P2');
  });

  it('createPortfolio 未指定 rebalanceFrequency 应默认 none', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: 'X',
          assets: [{ ticker: 'VTI', weight: 100 }],
          rebalance_frequency: 'none',
          owner_user_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    await createPortfolio(TENANT, null, { name: 'X', assets: [{ ticker: 'VTI', weight: 100 }] });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[4]).toBe('none');
  });

  it('mapRow 处理 null owner_user_id 和字符串日期', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: 'P',
          assets: [{ ticker: 'BND', weight: 100 }],
          rebalance_frequency: 'annual',
          owner_user_id: null,
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-02T00:00:00.000Z',
        },
      ],
    });
    const result = await listPortfolios(TENANT);
    expect(result[0].ownerUserId).toBeNull();
    expect(result[0].createdAt).toBe('2026-06-01T00:00:00.000Z');
    expect(result[0].updatedAt).toBe('2026-06-02T00:00:00.000Z');
  });
});

describe('savedConfigRepo', () => {
  it('createConfig 应序列化 config 为 JSONB', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: 'cfg',
          config: { a: 1 },
          owner_user_id: 'u1',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    await createConfig(TENANT, 'u1', { name: 'cfg', config: { a: 1 } });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[3]).toBe(JSON.stringify({ a: 1 }));
  });

  it('listConfigs 应经 withTenant', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listConfigs(TENANT);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
  });

  it('getConfig 成功应返回映射后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: 'cfg',
          config: { b: 2 },
          owner_user_id: 'u1',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const r = await getConfig(TENANT, ID);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('cfg');
  });

  it('getConfig 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getConfig(TENANT, ID)).toBeNull();
  });

  it('updateConfig 成功应返回更新后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: 'cfg2',
          config: { c: 3 },
          owner_user_id: 'u1',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
    });
    const r = await updateConfig(TENANT, ID, { name: 'cfg2', config: { c: 3 } });
    expect(r).not.toBeNull();
    expect(r!.name).toBe('cfg2');
  });

  it('updateConfig 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await updateConfig(TENANT, ID, { name: 'x', config: {} })).toBeNull();
  });

  it('deleteConfig 成功应返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteConfig(TENANT, ID)).toBe(true);
  });

  it('deleteConfig 不存在应返回 false', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deleteConfig(TENANT, ID)).toBe(false);
  });
});

describe('backtestRunRepo', () => {
  it('createRun result 为空时应写入 null', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: null,
          request: { x: 1 },
          result: null,
          status: 'completed',
          owner_user_id: null,
          created_at: new Date(),
        },
      ],
    });
    await createRun(TENANT, null, { request: { x: 1 } });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[3]).toBe(JSON.stringify({ x: 1 }));
    expect(params[4]).toBeNull();
    expect(params[5]).toBe('completed');
  });

  it('listRuns 应钳制 limit 上限为 200', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listRuns(TENANT, 9999);
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(200);
  });

  it('getRun 成功应返回映射后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: 'run1',
          request: { x: 1 },
          result: { y: 2 },
          status: 'completed',
          owner_user_id: 'u1',
          created_at: new Date(),
        },
      ],
    });
    const r = await getRun(TENANT, ID);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(r).not.toBeNull();
    expect(r!.status).toBe('completed');
  });

  it('getRun 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getRun(TENANT, ID)).toBeNull();
  });

  it('deleteRun 成功应返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteRun(TENANT, ID)).toBe(true);
  });

  it('deleteRun 不存在应返回 false', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deleteRun(TENANT, ID)).toBe(false);
  });

  it('mapRow 处理 null owner_user_id 和字符串日期', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        {
          id: ID,
          name: null,
          request: { a: 1 },
          result: null,
          status: 'failed',
          owner_user_id: null,
          created_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    });
    const r = await getRun(TENANT, ID);
    expect(r!.ownerUserId).toBeNull();
    expect(r!.name).toBeNull();
    expect(r!.createdAt).toBe('2026-06-01T00:00:00.000Z');
  });
});
