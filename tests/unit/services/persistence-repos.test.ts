import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), withTenant: vi.fn() }));
vi.mock('../../../packages/backend/src/db/pool.js', () => createPoolModuleMock(dbMocks));

import { createLoggerMocks, createPoolModuleMock } from '../../helpers/mockFactories.js';
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import {
  listPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  getPortfolio,
} from '../../../packages/backend/src/repositories/portfolioRepo.js';
import {
  createConfig,
  listConfigs,
  getConfig,
  updateConfig,
  deleteConfig,
} from '../../../packages/backend/src/repositories/savedConfigRepo.js';
import {
  createRun,
  listRuns,
  getRun,
  deleteRun,
} from '../../../packages/backend/src/repositories/backtestRunRepo.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';
const CONFIG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
beforeEach(() => vi.clearAllMocks());

function mockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    name: 'P',
    assets: [{ ticker: 'SPY', weight: 100 }],
    rebalance_frequency: 'monthly',
    owner_user_id: 'u1',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-02'),
    ...overrides,
  };
}

describe('portfolioRepo', () => {
  it('listPortfolios 应经 withTenant 并映射行', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [mockRow({ name: '60/40', assets: [{ ticker: 'SPY', weight: 60 }] })],
    });
    const result = await listPortfolios(TENANT);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(result[0]).toMatchObject({ id: ID, name: '60/40', rebalanceFrequency: 'monthly' });
    expect(result[0].assets).toEqual([{ ticker: 'SPY', weight: 60 }]);
  });
  it('createPortfolio 应序列化 assets 为 JSONB 参数', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        mockRow({
          name: 'X',
          assets: [{ ticker: 'QQQ', weight: 100 }],
          rebalance_frequency: 'none',
          owner_user_id: null,
        }),
      ],
    });
    await createPortfolio(TENANT, null, { name: 'X', assets: [{ ticker: 'QQQ', weight: 100 }] });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(TENANT);
    expect(params[3]).toBe(JSON.stringify([{ ticker: 'QQQ', weight: 100 }]));
    expect(params[4]).toBe('none');
  });
  it('createPortfolio 未指定 rebalanceFrequency 应默认 none', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        mockRow({
          name: 'X',
          assets: [{ ticker: 'VTI', weight: 100 }],
          rebalance_frequency: 'none',
          owner_user_id: null,
        }),
      ],
    });
    await createPortfolio(TENANT, null, { name: 'X', assets: [{ ticker: 'VTI', weight: 100 }] });
    expect(dbMocks.query.mock.calls[0][1][4]).toBe('none');
  });
  it('updatePortfolio 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(
      await updatePortfolio(TENANT, ID, { name: 'X', assets: [{ ticker: 'A', weight: 100 }] }),
    ).toBeNull();
  });
  it('updatePortfolio 成功应返回更新后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        mockRow({
          name: 'P2',
          assets: [{ ticker: 'QQQ', weight: 100 }],
          rebalance_frequency: 'quarterly',
        }),
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
  it('deletePortfolio 应按 rowCount 返回布尔', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deletePortfolio(TENANT, ID)).toBe(true);
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deletePortfolio(TENANT, ID)).toBe(false);
  });
  it('getPortfolio 成功应返回映射后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [mockRow({ name: 'P' })] });
    const r = await getPortfolio(TENANT, ID);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(r!.name).toBe('P');
  });
  it('getPortfolio 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getPortfolio(TENANT, ID)).toBeNull();
  });
  it('mapRow 处理 null owner_user_id 和字符串日期', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        mockRow({
          owner_user_id: null,
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-02T00:00:00.000Z',
          rebalance_frequency: 'annual',
          assets: [{ ticker: 'BND', weight: 100 }],
        }),
      ],
    });
    const result = await listPortfolios(TENANT);
    expect(result[0].ownerUserId).toBeNull();
    expect(result[0].createdAt).toBe('2026-06-01T00:00:00.000Z');
    expect(result[0].updatedAt).toBe('2026-06-02T00:00:00.000Z');
  });
});

describe('savedConfigRepo', () => {
  const baseRow = {
    id: CONFIG_ID,
    name: 'test-cfg',
    config: { tickers: ['SPY', 'QQQ'], startDate: '2024-01-01' },
    owner_user_id: 'u1',
    created_at: new Date('2026-06-01T00:00:00.000Z'),
    updated_at: new Date('2026-06-01T00:00:00.000Z'),
  };

  it('createConfig 应序列化 config 为 JSONB', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ ...baseRow, config: { a: 1 } }] });
    await createConfig(TENANT, 'u1', { name: 'cfg', config: { a: 1 } });
    expect(dbMocks.query.mock.calls[0][1][3]).toBe(JSON.stringify({ a: 1 }));
  });
  it('createConfig 应返回完整创建记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
    const r = await createConfig(TENANT, 'u1', {
      name: 'test-cfg',
      config: { tickers: ['SPY', 'QQQ'], startDate: '2024-01-01' },
    });
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(r).toMatchObject({ id: CONFIG_ID, name: 'test-cfg', ownerUserId: 'u1' });
    expect(r.createdAt).toBe('2026-06-01T00:00:00.000Z');
  });
  it('createConfig 空 ownerUserId 应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [{ ...baseRow, owner_user_id: null }] });
    const r = await createConfig(TENANT, null, { name: 'test-cfg', config: {} });
    expect(r.ownerUserId).toBeNull();
  });
  it('listConfigs 应经 withTenant', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listConfigs(TENANT);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
  });
  it('listConfigs 空数据库应返回空数组', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await listConfigs(TENANT)).toEqual([]);
  });
  it('listConfigs 应钳制 limit 上限为 200', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listConfigs(TENANT, 9999);
    expect(dbMocks.query.mock.calls[0][1][0]).toBe(200);
  });
  it('listConfigs 默认 limit 应为 50', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listConfigs(TENANT);
    expect(dbMocks.query.mock.calls[0][1][0]).toBe(50);
  });
  it('listConfigs limit 为 0 应传 0', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listConfigs(TENANT, 0);
    expect(dbMocks.query.mock.calls[0][1][0]).toBe(0);
  });
  it('getConfig 成功应返回映射后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
    const r = await getConfig(TENANT, CONFIG_ID);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('test-cfg');
  });
  it('getConfig 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getConfig(TENANT, CONFIG_ID)).toBeNull();
  });
  it('updateConfig 应返回更新后的完整记录', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{ ...baseRow, name: 'cfg-updated', config: { a: 2 } }],
    });
    const r = await updateConfig(TENANT, CONFIG_ID, { name: 'cfg-updated', config: { a: 2 } });
    expect(r).not.toBeNull();
    expect(r!.name).toBe('cfg-updated');
  });
  it('updateConfig 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await updateConfig(TENANT, CONFIG_ID, { name: 'x', config: {} })).toBeNull();
  });
  it.each([
    [1, true],
    [0, false],
  ])('deleteConfig rowCount=%s 应返回 %s', async (count, expected) => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: count });
    expect(await deleteConfig(TENANT, CONFIG_ID)).toBe(expected);
  });
});

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    name: null,
    request: { tickers: ['SPY'] },
    result: null,
    status: 'completed',
    owner_user_id: null,
    created_at: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

describe('backtestRunRepo', () => {
  it('createRun result 为空时应写入 null', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [runRow({ request: { x: 1 }, result: null, status: 'completed' })],
    });
    await createRun(TENANT, null, { request: { x: 1 } });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[3]).toBe(JSON.stringify({ x: 1 }));
    expect(params[4]).toBeNull();
    expect(params[5]).toBe('completed');
  });
  it('createRun 应使用传入的 result 并序列化', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [runRow({ result: { sharpe: 1.5 } })] });
    const r = await createRun(TENANT, 'u1', {
      request: { x: 1 },
      result: { sharpe: 1.5 },
      status: 'completed',
    });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[1]).toBe('u1');
    expect(params[3]).toBe(JSON.stringify({ x: 1 }));
    expect(params[4]).toBe(JSON.stringify({ sharpe: 1.5 }));
    expect(params[5]).toBe('completed');
    expect(r.result).toEqual({ sharpe: 1.5 });
  });
  it('createRun status 未指定时默认 completed', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [runRow()] });
    await createRun(TENANT, null, { request: {} });
    expect(dbMocks.query.mock.calls[0][1][5]).toBe('completed');
  });
  it('createRun result 为 undefined 时应写入 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [runRow()] });
    await createRun(TENANT, null, { request: {} });
    expect(dbMocks.query.mock.calls[0][1][4]).toBeNull();
  });
  it('listRuns 应钳制 limit 上限为 200', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listRuns(TENANT, 9999);
    expect(dbMocks.query.mock.calls[0][1][0]).toBe(200);
  });
  it('listRuns limit 下限钳制为 1', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [runRow()] });
    await listRuns(TENANT, -5);
    expect(dbMocks.query.mock.calls[0][1][0]).toBe(1);
  });
  it('listRuns limit 0 应钳制为 1', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [runRow()] });
    await listRuns(TENANT, 0);
    expect(dbMocks.query.mock.calls[0][1][0]).toBe(1);
  });
  it('listRuns 应返回映射后的记录数组', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        runRow({ name: 'run-a', owner_user_id: 'u1' }),
        runRow({ id: 'id-2', name: 'run-b', owner_user_id: 'u2', request: { y: 2 } }),
      ],
    });
    const runs = await listRuns(TENANT, 10);
    expect(runs).toHaveLength(2);
    expect(runs[0].name).toBe('run-a');
    expect(runs[0].ownerUserId).toBe('u1');
    expect(runs[1].name).toBe('run-b');
    expect(runs[1].ownerUserId).toBe('u2');
  });
  it('getRun 存在记录时应返回映射后的对象', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [runRow({ name: 'test run', status: 'running' })],
    });
    const r = await getRun(TENANT, ID);
    expect(r).not.toBeNull();
    expect(r!.id).toBe(ID);
    expect(r!.name).toBe('test run');
    expect(r!.status).toBe('running');
    expect(r!.ownerUserId).toBeNull();
    expect(r!.createdAt).toBe('2026-01-15T10:00:00.000Z');
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
  });
  it('getRun 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getRun(TENANT, 'missing-id')).toBeNull();
  });
  it('mapRow 处理 null owner_user_id 和字符串日期', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        runRow({
          name: null,
          request: { a: 1 },
          result: null,
          status: 'failed',
          owner_user_id: null,
          created_at: '2026-06-01T00:00:00.000Z',
        }),
      ],
    });
    const r = await getRun(TENANT, ID);
    expect(r!.ownerUserId).toBeNull();
    expect(r!.name).toBeNull();
    expect(r!.createdAt).toBe('2026-06-01T00:00:00.000Z');
  });
  it.each([
    [1, true],
    [0, false],
  ])('deleteRun rowCount=%s 应返回 %s', async (count, expected) => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: count });
    expect(await deleteRun(TENANT, ID)).toBe(expected);
    expect(dbMocks.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM backtest_runs'),
      [ID],
    );
  });
});
