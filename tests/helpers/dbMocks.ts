/**
 * 测试辅助:PostgreSQL Pool / PoolClient mock 工厂
 *
 * 企业理由:4 个测试文件(market-stats / macro-data / audit-log.transactional / outbox-writer)
 * 重复定义相同的 createMockPool / createMockClient 工厂,每次调整 mock 行为需逐文件修改。
 * 本模块集中维护共享 mock 工厂,消除重复,确保行为一致。
 *
 * 用法:
 *   import { createMockPool, createMockClient } from '../helpers/dbMocks.js';
 *   const mockPool = createMockPool();
 *   const mockClient = createMockClient();
 */

import { vi } from 'vitest';
import type { PoolClient } from 'pg';

/**
 * 构造一个 mock pg.Pool,默认 query 返回空结果集
 *
 * 默认 query 解析为 `{ rows: [], rowCount: 0 }`,可通过 `queryMockResolvedValue`
 * 在测试用例内覆写(如 `mockPool.query.mockResolvedValueOnce({ rows: [...] })`)。
 *
 * @returns 包含 mock query 方法的对象(可强转为 pg.Pool)
 */
export function createMockPool(): { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  } as unknown as { query: ReturnType<typeof vi.fn> };
}

/**
 * 构造一个 mock PoolClient,记录所有 query 调用
 *
 * 默认 query 解析为 `{ rows: [], rowCount: 1 }`(模拟 INSERT/UPDATE 成功),
 * release 为 no-op。适用于事务双写场景(audit-log.transactional / outbox-writer),
 * 验证 client.query 调用契约而非真实数据库行为。
 *
 * @returns 包含 mock query + release 方法的 PoolClient
 */
export function createMockClient(): PoolClient & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
    release: vi.fn(),
  } as unknown as PoolClient & { query: ReturnType<typeof vi.fn> };
}
