/**
 * 回测运行仓储单元测试（ADR-034）
 *
 * 企业理由：回测运行历史是租户级资产，CRUD 正确性直接影响历史回看与配额计量。
 *
 * Mock 策略：mock db.withTenant —— 以 fake client 执行回调，捕获 SQL/params。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  query: vi.fn(),
  withTenant: vi.fn(),
}));

import { createLoggerMocks } from '../../helpers/mockFactories.js';

vi.mock('../../../packages/backend/src/db/pool.js', () => ({
  withTenant: (tenantId: string, fn: (client: { query: typeof dbMocks.query }) => unknown) => {
    dbMocks.withTenant(tenantId);
    return fn({ query: dbMocks.query });
  },
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import {
  listRuns,
  getRun,
  createRun,
  deleteRun,
} from '../../../packages/backend/src/repositories/backtestRunRepo.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    name: null,
    request: { tickers: ['SPY'] },
    result: null,
    status: 'completed',
    owner_user_id: null,
    created_at: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('getRun', () => {
  it('存在记录时应返回映射后的对象', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [row({ name: 'test run', status: 'running' })] });
    const r = await getRun(TENANT, RUN_ID);
    expect(r).not.toBeNull();
    expect(r!.id).toBe(RUN_ID);
    expect(r!.name).toBe('test run');
    expect(r!.status).toBe('running');
    expect(r!.ownerUserId).toBeNull();
    expect(r!.createdAt).toBe('2026-01-15T10:00:00.000Z');
    expect(dbMocks.withTenant).toHaveBeenCalledWith(TENANT);
  });

  it('不存在记录时应返回 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [] });
    expect(await getRun(TENANT, 'missing-id')).toBeNull();
  });
});

describe('createRun', () => {
  it('应使用传入的 result 并序列化', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [row({ result: { sharpe: 1.5 } })] });
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

  it('status 未指定时默认 completed', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [row()] });
    await createRun(TENANT, null, { request: {} });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[5]).toBe('completed');
  });

  it('result 为 undefined 时应写入 null', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [row()] });
    await createRun(TENANT, null, { request: {} });
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[4]).toBeNull();
  });
});

describe('deleteRun', () => {
  it('删除成功应返回 true', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteRun(TENANT, RUN_ID)).toBe(true);
    expect(dbMocks.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM backtest_runs'),
      [RUN_ID],
    );
  });

  it('无匹配记录应返回 false', async () => {
    dbMocks.query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deleteRun(TENANT, RUN_ID)).toBe(false);
  });
});

describe('listRuns', () => {
  it('limit 下限钳制为 1', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [row()] });
    await listRuns(TENANT, -5);
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(1);
  });

  it('limit 0 应钳制为 1', async () => {
    dbMocks.query.mockResolvedValueOnce({ rows: [row()] });
    await listRuns(TENANT, 0);
    const [, params] = dbMocks.query.mock.calls[0];
    expect(params[0]).toBe(1);
  });

  it('应返回映射后的记录数组', async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [
        row({ name: 'run-a', owner_user_id: 'u1' }),
        row({ id: 'id-2', name: 'run-b', owner_user_id: 'u2', request: { y: 2 } }),
      ],
    });
    const runs = await listRuns(TENANT, 10);
    expect(runs).toHaveLength(2);
    expect(runs[0].name).toBe('run-a');
    expect(runs[0].ownerUserId).toBe('u1');
    expect(runs[1].name).toBe('run-b');
    expect(runs[1].ownerUserId).toBe('u2');
  });
});
