import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), withTenant: vi.fn() }));
vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  withTenant: (t: string, fn: (c: { query: typeof dbMocks.query }) => unknown) => { dbMocks.withTenant(t); return fn({ query: dbMocks.query }); },
  withTenantReadOnly: (t: string, fn: (c: { query: typeof dbMocks.query }) => unknown) => { dbMocks.withTenant(t); return fn({ query: dbMocks.query }); },
}));

import { listPortfolios, createPortfolio, updatePortfolio, deletePortfolio, getPortfolio } from '../../../packages/backend/src/repositories/portfolioRepo.js';
import { createConfig, listConfigs, getConfig, updateConfig, deleteConfig } from '../../../packages/backend/src/repositories/savedConfigRepo.js';
import { createRun, listRuns, getRun, deleteRun } from '../../../packages/backend/src/repositories/backtestRunRepo.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';
beforeEach(() => vi.clearAllMocks());

function mockRow(overrides: Record<string, unknown> = {}) {
  return { id: ID, name: 'P', assets: [{ ticker: 'SPY', weight: 100 }], rebalance_frequency: 'monthly', owner_user_id: 'u1', created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-02'), ...overrides };
}

describe('portfolioRepo', () => {
  it('listPortfolios 应经 withTenant 并映射行', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [mockRow({ name: '60/40', assets: [{ ticker: 'SPY', weight: 60 }] })] });
    const result = await listPortfolios(TENANT);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(result[0]).toMatchObject({ id: ID, name: '60/40', rebalanceFrequency: 'monthly' });
    expect(result[0].assets).toEqual([{ ticker: 'SPY', weight: 60 }]);
  });
  it('createPortfolio 应序列化 assets 为 JSONB 参数', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [mockRow({ name: 'X', assets: [{ ticker: 'QQQ', weight: 100 }], rebalance_frequency: 'none', owner_user_id: null })] });
    await createPortfolio(TENANT, null, { name: 'X', assets: [{ ticker: 'QQQ', weight: 100 }] });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(TENANT); expect(params[3]).toBe(JSON.stringify([{ ticker: 'QQQ', weight: 100 }])); expect(params[4]).toBe('none');
  });
  it('createPortfolio 未指定 rebalanceFrequency 应默认 none', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [mockRow({ name: 'X', assets: [{ ticker: 'VTI', weight: 100 }], rebalance_frequency: 'none', owner_user_id: null })] });
    await createPortfolio(TENANT, null, { name: 'X', assets: [{ ticker: 'VTI', weight: 100 }] });
    expect(dbMocks.query.mock.calls[0][1][4]).toBe('none');
  });
  it('updatePortfolio 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await updatePortfolio(TENANT, ID, { name: 'X', assets: [{ ticker: 'A', weight: 100 }] })).toBeNull();
  });
  it('updatePortfolio 成功应返回更新后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [mockRow({ name: 'P2', assets: [{ ticker: 'QQQ', weight: 100 }], rebalance_frequency: 'quarterly' })] });
    const r = await updatePortfolio(TENANT, ID, { name: 'P2', assets: [{ ticker: 'QQQ', weight: 100 }], rebalanceFrequency: 'quarterly' });
    expect(r).not.toBeNull(); expect(r!.name).toBe('P2');
  });
  it('deletePortfolio 应按 rowCount 返回布尔', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deletePortfolio(TENANT, ID)).toBe(true);
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deletePortfolio(TENANT, ID)).toBe(false);
  });
  it('getPortfolio 成功应返回映射后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [mockRow({ name: 'P' })] });
    const r = await getPortfolio(TENANT, ID);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT); expect(r!.name).toBe('P');
  });
  it('getPortfolio 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getPortfolio(TENANT, ID)).toBeNull();
  });
  it('mapRow 处理 null owner_user_id 和字符串日期', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [mockRow({ owner_user_id: null, created_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-02T00:00:00.000Z', rebalance_frequency: 'annual', assets: [{ ticker: 'BND', weight: 100 }] })] });
    const result = await listPortfolios(TENANT);
    expect(result[0].ownerUserId).toBeNull();
    expect(result[0].createdAt).toBe('2026-06-01T00:00:00.000Z');
    expect(result[0].updatedAt).toBe('2026-06-02T00:00:00.000Z');
  });
});

describe('savedConfigRepo', () => {
  const cfgRow = (overrides: Record<string, unknown> = {}) => ({ id: ID, name: 'cfg', config: { a: 1 }, owner_user_id: 'u1', created_at: new Date(), updated_at: new Date(), ...overrides });
  it('createConfig 应序列化 config 为 JSONB', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [cfgRow({ config: { a: 1 } })] });
    await createConfig(TENANT, 'u1', { name: 'cfg', config: { a: 1 } });
    expect(dbMocks.query.mock.calls[0][1][3]).toBe(JSON.stringify({ a: 1 }));
  });
  it('listConfigs 应经 withTenant', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listConfigs(TENANT);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
  });
  it('getConfig 成功应返回映射后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [cfgRow({ name: 'cfg', config: { b: 2 } })] });
    const r = await getConfig(TENANT, ID);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT); expect(r!.name).toBe('cfg');
  });
  it('getConfig 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getConfig(TENANT, ID)).toBeNull();
  });
  it('updateConfig 成功应返回更新后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [cfgRow({ name: 'cfg2', config: { c: 3 } })] });
    const r = await updateConfig(TENANT, ID, { name: 'cfg2', config: { c: 3 } });
    expect(r!.name).toBe('cfg2');
  });
  it('updateConfig 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await updateConfig(TENANT, ID, { name: 'x', config: {} })).toBeNull();
  });
  it.each([[1, true], [0, false]])('deleteConfig rowCount=%s 应返回 %s', async (count, expected) => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: count });
    expect(await deleteConfig(TENANT, ID)).toBe(expected);
  });
});

describe('backtestRunRepo', () => {
  const runRow = (overrides: Record<string, unknown> = {}) => ({ id: ID, name: null, request: { x: 1 }, result: null, status: 'completed', owner_user_id: null, created_at: new Date(), ...overrides });
  it('createRun result 为空时应写入 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [runRow({ request: { x: 1 }, result: null, status: 'completed' })] });
    await createRun(TENANT, null, { request: { x: 1 } });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[3]).toBe(JSON.stringify({ x: 1 })); expect(params[4]).toBeNull(); expect(params[5]).toBe('completed');
  });
  it('listRuns 应钳制 limit 上限为 200', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listRuns(TENANT, 9999);
    expect(dbMocks.query.mock.calls[0][1][0]).toBe(200);
  });
  it('getRun 成功应返回映射后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [runRow({ name: 'run1', result: { y: 2 }, status: 'completed', owner_user_id: 'u1' })] });
    const r = await getRun(TENANT, ID);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT); expect(r!.status).toBe('completed');
  });
  it('getRun 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getRun(TENANT, ID)).toBeNull();
  });
  it.each([[1, true], [0, false]])('deleteRun rowCount=%s 应返回 %s', async (count, expected) => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: count });
    expect(await deleteRun(TENANT, ID)).toBe(expected);
  });
  it('mapRow 处理 null owner_user_id 和字符串日期', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [runRow({ name: null, request: { a: 1 }, result: null, status: 'failed', owner_user_id: null, created_at: '2026-06-01T00:00:00.000Z' })] });
    const r = await getRun(TENANT, ID);
    expect(r!.ownerUserId).toBeNull(); expect(r!.name).toBeNull(); expect(r!.createdAt).toBe('2026-06-01T00:00:00.000Z');
  });
});