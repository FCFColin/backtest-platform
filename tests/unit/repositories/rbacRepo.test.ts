import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loggerMocks } from '../../helpers/loggerFixture.js';

const dbMocks = vi.hoisted(() => {
  const mockClient = { query: vi.fn(), release: vi.fn() };
  return {
    clientQuery: mockClient.query,
    clientRelease: mockClient.release,
    poolQuery: vi.fn(),
    withTenant: vi.fn(),
    mockClient,
  };
});

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  getPool: () => ({ query: dbMocks.poolQuery, connect: async () => dbMocks.mockClient }),
  withTenant: <T>(tenantId: string, fn: (c: typeof dbMocks.mockClient) => Promise<T>) => {
    dbMocks.withTenant(tenantId);
    return fn(dbMocks.mockClient);
  },
  withTenantReadOnly: <T>(tenantId: string, fn: (c: typeof dbMocks.mockClient) => Promise<T>) => {
    dbMocks.withTenant(tenantId);
    return fn(dbMocks.mockClient);
  },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

import { getUserPermissions } from '../../../packages/backend/src/repositories/rbacRepo.js';

const USER_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => vi.clearAllMocks());

describe('getUserPermissions', () => {
  it('应返回去重后的权限集合（UNION）', async () => {
    dbMocks.poolQuery.mockResolvedValue({
      rows: [{ permission: 'backtest:run' }, { permission: 'data:read' }],
    });
    expect(await getUserPermissions(USER_ID)).toEqual(['backtest:run', 'data:read']);
    expect(dbMocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT DISTINCT rp.permission'),
      [USER_ID],
    );
  });

  it('无角色绑定时应返回空数组', async () => {
    dbMocks.poolQuery.mockResolvedValue({ rows: [] });
    expect(await getUserPermissions(USER_ID)).toEqual([]);
  });
});
