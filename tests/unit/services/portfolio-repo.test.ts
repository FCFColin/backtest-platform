import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTenant: vi.fn(),
}));

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  withTenant: (_tenantId: string, fn: (client: { query: typeof dbMocks.query }) => unknown) => {
    dbMocks.withTenant(_tenantId);
    return fn({ query: dbMocks.query });
  },
}));

import {
  getPortfolio,
  listPortfolios,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
} from '../../../packages/backend/src/repositories/portfolioRepo.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PORTFOLIO_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const baseRow = {
  id: PORTFOLIO_ID,
  name: 'Test Portfolio',
  assets: [
    { ticker: 'SPY', weight: 60 },
    { ticker: 'BND', weight: 40 },
  ],
  rebalance_frequency: 'quarterly',
  owner_user_id: 'u1',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-06-01T00:00:00.000Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('getPortfolio', () => {
  it('应返回完整 PortfolioRecord', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
    const r = await getPortfolio(TENANT, PORTFOLIO_ID);
    expect(r).not.toBeNull();
    expect(r!.id).toBe(PORTFOLIO_ID);
    expect(r!.name).toBe('Test Portfolio');
    expect(r!.assets).toHaveLength(2);
    expect(r!.rebalanceFrequency).toBe('quarterly');
    expect(r!.ownerUserId).toBe('u1');
    expect(r!.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(r!.updatedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
  });

  it('不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const r = await getPortfolio(TENANT, PORTFOLIO_ID);
    expect(r).toBeNull();
  });
});

describe('deletePortfolio', () => {
  it('删除成功应返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    const r = await deletePortfolio(TENANT, PORTFOLIO_ID);
    expect(r).toBe(true);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(dbMocks.query).toHaveBeenCalledWith('DELETE FROM portfolios WHERE id = $1', [
      PORTFOLIO_ID,
    ]);
  });

  it('ID 不存在应返回 false', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    const r = await deletePortfolio(TENANT, PORTFOLIO_ID);
    expect(r).toBe(false);
  });

  it('rowCount 为 undefined 时应返回 false', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: undefined });
    const r = await deletePortfolio(TENANT, PORTFOLIO_ID);
    expect(r).toBe(false);
  });
});

describe('listPortfolios', () => {
  it('应使用默认 limit 和 offset', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listPortfolios(TENANT);
    expect(dbMocks.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [50, 0]);
  });

  it('应钳制 limit 上限为 200', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listPortfolios(TENANT, 9999);
    expect(dbMocks.query).toHaveBeenCalledWith(expect.any(String), [200, 0]);
  });

  it('应使用自定义 limit 和 offset', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listPortfolios(TENANT, 25, 100);
    expect(dbMocks.query).toHaveBeenCalledWith(expect.any(String), [25, 100]);
  });

  it('负 offset 应钳制为 0', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listPortfolios(TENANT, 50, -5);
    expect(dbMocks.query).toHaveBeenCalledWith(expect.any(String), [50, 0]);
  });

  it('应返回映射后的 PortfolioRecord 数组', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [baseRow, { ...baseRow, id: 'bbbb', name: 'Portfolio 2' }],
    });
    const r = await listPortfolios(TENANT);
    expect(r).toHaveLength(2);
    expect(r[0].name).toBe('Test Portfolio');
    expect(r[1].name).toBe('Portfolio 2');
  });
});

describe('createPortfolio', () => {
  it('应设置默认 rebalanceFrequency 为 none', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
    await createPortfolio(TENANT, 'u1', {
      name: 'Test',
      assets: [{ ticker: 'SPY', weight: 100 }],
    });
    const insertParams = dbMocks.query.mock.calls[0][1];
    expect(insertParams[4]).toBe('none');
  });

  it('应传入指定的 rebalanceFrequency', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
    await createPortfolio(TENANT, 'u1', {
      name: 'Test',
      assets: [{ ticker: 'SPY', weight: 100 }],
      rebalanceFrequency: 'monthly',
    });
    const insertParams = dbMocks.query.mock.calls[0][1];
    expect(insertParams[4]).toBe('monthly');
  });
});

describe('updatePortfolio', () => {
  it('应更新并返回新记录', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{ ...baseRow, name: 'Updated', rebalance_frequency: 'annually' }],
    });
    const r = await updatePortfolio(TENANT, PORTFOLIO_ID, {
      name: 'Updated',
      assets: [{ ticker: 'VTI', weight: 100 }],
      rebalanceFrequency: 'annually',
    });
    expect(r).not.toBeNull();
    expect(r!.name).toBe('Updated');
    expect(r!.rebalanceFrequency).toBe('annually');
  });

  it('不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const r = await updatePortfolio(TENANT, PORTFOLIO_ID, {
      name: 'X',
      assets: [{ ticker: 'A', weight: 100 }],
    });
    expect(r).toBeNull();
  });
});
