import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => {
  const mockClient = { query: vi.fn(), release: vi.fn() };
  return {
    clientQuery: mockClient.query,
    withTenant: vi.fn(),
    withTenantReadOnly: vi.fn(),
    mockClient,
  };
});

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  withTenant: <T>(tenantId: string, fn: (c: typeof dbMocks.mockClient) => Promise<T>) => {
    dbMocks.withTenant(tenantId);
    return fn(dbMocks.mockClient);
  },
  withTenantReadOnly: <T>(tenantId: string, fn: (c: typeof dbMocks.mockClient) => Promise<T>) => {
    dbMocks.withTenantReadOnly(tenantId);
    return fn(dbMocks.mockClient);
  },
}));

import {
  findByTenant,
  findById,
  create,
  update,
  remove,
  count,
} from '../../../packages/backend/src/repositories/tacticalConfigRepository.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const CONFIG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const configRow = {
  id: CONFIG_ID,
  name: 'My Strategy',
  description: 'desc',
  config: { foo: 'bar' },
  user_id: USER_ID,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-06-01T00:00:00.000Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('findByTenant', () => {
  it('应使用 withTenantReadOnly 并返回映射后的配置列表', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [configRow] });
    const result = await findByTenant(ORG, 10, 5);
    expect(dbMocks.withTenantReadOnly).toHaveBeenCalledWith(ORG);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: CONFIG_ID,
      name: 'My Strategy',
      userId: USER_ID,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    const [sql, params] = dbMocks.clientQuery.mock.calls[0];
    expect(sql).toContain('ORDER BY updated_at DESC');
    expect(params).toEqual([10, 5]);
  });

  it('limit 应被截断到 200', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [] });
    await findByTenant(ORG, 500);
    expect(dbMocks.clientQuery.mock.calls[0][1][0]).toBe(200);
  });

  it('offset 负数应被归零', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [] });
    await findByTenant(ORG, 10, -5);
    expect(dbMocks.clientQuery.mock.calls[0][1][1]).toBe(0);
  });
});

describe('findById', () => {
  it('存在时应返回配置记录', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [configRow] });
    const result = await findById(ORG, CONFIG_ID);
    expect(result).toMatchObject({ id: CONFIG_ID, name: 'My Strategy' });
    expect(dbMocks.withTenantReadOnly).toHaveBeenCalledWith(ORG);
  });

  it('不存在时应返回 null', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [] });
    expect(await findById(ORG, CONFIG_ID)).toBeNull();
  });
});

describe('create', () => {
  it('应使用 withTenant 并返回新建记录', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [configRow] });
    const result = await create(ORG, USER_ID, {
      name: 'My Strategy',
      description: 'desc',
      config: { foo: 'bar' },
    });
    expect(result).toMatchObject({ id: CONFIG_ID, name: 'My Strategy' });
    expect(dbMocks.withTenant).toHaveBeenCalledWith(ORG);
    const [sql, params] = dbMocks.clientQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO tactical_configs');
    expect(params).toEqual([ORG, USER_ID, 'My Strategy', 'desc', { foo: 'bar' }]);
  });

  it('description 未提供时应传 null', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [{ ...configRow, description: null }] });
    await create(ORG, USER_ID, { name: 'x', config: {} });
    expect(dbMocks.clientQuery.mock.calls[0][1][3]).toBeNull();
  });
});

describe('update', () => {
  it('应动态构建 SET 子句并返回更新记录', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [{ ...configRow, name: 'Updated' }] });
    const result = await update(ORG, CONFIG_ID, { name: 'Updated', config: { x: 1 } });
    expect(result).toMatchObject({ name: 'Updated' });
    const [sql, params] = dbMocks.clientQuery.mock.calls[0];
    expect(sql).toContain('name = $2');
    expect(sql).toContain('config = $3');
    expect(params).toEqual([CONFIG_ID, 'Updated', { x: 1 }]);
  });

  it('仅更新 description 时应正确构建参数', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [{ ...configRow, description: 'new' }] });
    await update(ORG, CONFIG_ID, { description: 'new' });
    const [sql, params] = dbMocks.clientQuery.mock.calls[0];
    expect(sql).toContain('description = $2');
    expect(params).toEqual([CONFIG_ID, 'new']);
  });

  it('无更新字段时应回退到 findById', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [configRow] });
    const result = await update(ORG, CONFIG_ID, {});
    expect(result).toMatchObject({ id: CONFIG_ID });
    expect(dbMocks.withTenantReadOnly).toHaveBeenCalled();
  });

  it('更新不存在的记录应返回 null', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [] });
    expect(await update(ORG, CONFIG_ID, { name: 'x' })).toBeNull();
  });
});

describe('remove', () => {
  it.each([
    [1, true],
    [0, false],
    [undefined, false],
  ])('rowCount=%s 应返回 %s', async (count, expected) => {
    dbMocks.clientQuery.mockResolvedValue({ rowCount: count });
    expect(await remove(ORG, CONFIG_ID)).toBe(expected);
    expect(dbMocks.withTenant).toHaveBeenCalledWith(ORG);
  });
});

describe('count', () => {
  it('应返回租户配置数量', async () => {
    dbMocks.clientQuery.mockResolvedValue({ rows: [{ count: 42 }] });
    expect(await count(ORG)).toBe(42);
    expect(dbMocks.withTenantReadOnly).toHaveBeenCalledWith(ORG);
  });
});
