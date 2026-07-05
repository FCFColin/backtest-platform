/**
 * portfolioRepo 额外单元测试（LIMIT 行为 + 边界）
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
  listPortfolios,
  createPortfolio,
  updatePortfolio,
} from '../../../api/services/portfolioRepo.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PORTFOLIO_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

beforeEach(() => vi.clearAllMocks());

describe('portfolioRepo LIMIT 行为', () => {
  it('listPortfolios 应钳制 limit 上限为 200', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listPortfolios(TENANT, 9999);
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(200);
  });

  it('listPortfolios 默认 limit 应为 50', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listPortfolios(TENANT);
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(50);
  });

  it('listPortfolios limit 为 0 应传 0（不返回结果）', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    await listPortfolios(TENANT, 0);
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(0);
  });
});

describe('portfolioRepo 空数据库', () => {
  it('listPortfolios 空数据库应返回空数组', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const r = await listPortfolios(TENANT);
    expect(r).toEqual([]);
  });

  it('getPortfolio 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const { getPortfolio } = await import('../../../api/services/portfolioRepo.js');
    expect(await getPortfolio(TENANT, PORTFOLIO_ID)).toBeNull();
  });
});

describe('portfolioRepo CRUD 边界', () => {
  const baseRow = {
    id: PORTFOLIO_ID,
    name: '60/40',
    assets: [{ ticker: 'SPY', weight: 60 }],
    rebalance_frequency: 'monthly',
    owner_user_id: 'u1',
    created_at: new Date('2026-06-01T00:00:00.000Z'),
    updated_at: new Date('2026-06-02T00:00:00.000Z'),
  };

  it('createPortfolio 应返回完整创建记录', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [baseRow] });
    const r = await createPortfolio(TENANT, 'u1', {
      name: '60/40',
      assets: [{ ticker: 'SPY', weight: 60 }],
    });
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
    expect(r).toMatchObject({
      id: PORTFOLIO_ID,
      name: '60/40',
      ownerUserId: 'u1',
      rebalanceFrequency: 'monthly',
    });
    expect(r.createdAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('createPortfolio 空 ownerUserId 应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{ ...baseRow, owner_user_id: null }],
    });
    const r = await createPortfolio(TENANT, null, {
      name: '60/40',
      assets: [{ ticker: 'SPY', weight: 60 }],
    });
    expect(r.ownerUserId).toBeNull();
  });

  it('updatePortfolio 不存在应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    const r = await updatePortfolio(TENANT, PORTFOLIO_ID, {
      name: 'X',
      assets: [{ ticker: 'A', weight: 100 }],
    });
    expect(r).toBeNull();
  });

  it('updatePortfolio 成功应返回更新后的记录', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{ ...baseRow, name: '80/20', rebalance_frequency: 'quarterly' }],
    });
    const r = await updatePortfolio(TENANT, PORTFOLIO_ID, {
      name: '80/20',
      assets: [{ ticker: 'SPY', weight: 80 }],
      rebalanceFrequency: 'quarterly',
    });
    expect(r).not.toBeNull();
    expect(r!.name).toBe('80/20');
    expect(r!.rebalanceFrequency).toBe('quarterly');
  });
});
