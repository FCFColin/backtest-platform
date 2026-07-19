/**
 * 数据引擎管理路由单元测试 —— 写端点与废弃端点
 *
 * 企业理由：数据管理路由的写端点（全量/增量更新、停止、resume、universe、
 * regenerate-meta）受 DATA_MANAGE 权限保护，HTTP 方法语义正确性影响客户端集成。
 * 测试覆盖：权限校验、成功/错误路径、废弃 POST 端点兼容性。
 *
 * 共享 setup（app factory / 服务 mock / mock stats）抽到
 * tests/helpers/dataManageRoutesFixtures.ts，便于复用与维护。
 * 只读端点测试见 data-manage-routes.read.test.ts。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  engineServiceMocks,
  dataFetchMocks,
  startApp,
  createMockStats,
} from '../../helpers/dataManageRoutesFixtures.js';
import type { TestServer } from '../../helpers/expressApp.js';

describe('dataManageRoutes - 数据更新端点（已激活）', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });

  afterEach(async () => {
    await server.close();
  });

  // 数据摄取端点已从 501 退役状态激活，通过 Go worker 执行全量/增量更新
  it.each([
    ['PUT', '/update/full'],
    ['PATCH', '/update/inc'],
    ['PUT', '/update/refetch'],
    ['PATCH', '/resume'],
    ['PUT', '/universe'],
    ['PUT', '/regenerate-meta'],
  ])('%s %s 不应再返回 501', async (method, path) => {
    const res = await fetch(`${server.url}/api/v1/data/manage${path}`, { method });
    expect(res.status).not.toBe(501);
  });
});

describe('dataManageRoutes - 写端点权限保护（对抗性）', () => {
  let server: TestServer;

  afterEach(async () => {
    await server.close();
  });

  it('未认证请求写端点应返回 401（鉴权先于业务逻辑）', async () => {
    vi.clearAllMocks();
    server = await startApp(null);
    const res = await fetch(`${server.url}/api/v1/data/manage/update/full`, { method: 'PUT' });

    // 关键：鉴权拦截必须先于业务逻辑（否则会先暴露 501 端点存在性）
    expect(res.status).toBe(401);
  });

  it('readonly 角色（无 DATA_MANAGE 权限）写端点应返回 403', async () => {
    vi.clearAllMocks();
    server = await startApp('readonly');
    const res = await fetch(`${server.url}/api/v1/data/manage/universe`, { method: 'PUT' });

    expect(res.status).toBe(403);
  });

  it('analyst 角色具备 DATA_MANAGE 权限，鉴权放行后不返回 401/403/501', async () => {
    vi.clearAllMocks();
    server = await startApp('analyst');
    const res = await fetch(`${server.url}/api/v1/data/manage/update/inc`, { method: 'PATCH' });

    // 鉴权通过（非 401/403），端点已激活（非 501）
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(501);
  });
});

describe('dataManageRoutes - 废弃 POST 端点', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /update/full 不应返回 501，应设置 Deprecation/Sunset/Link 头', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/update/full`, { method: 'POST' });

    // 不再返回 501（已激活）
    expect(res.status).not.toBe(501);
    // 废弃头仍保留，引导客户端迁移到 PUT
    expect(res.headers.get('deprecation')).toBe('true');
    expect(res.headers.get('sunset')).toBeTruthy();
    expect(res.headers.get('link')).toContain('successor-version');
  });
});

describe('dataManageRoutes - PUT /update/full', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });

  afterEach(async () => {
    await server.close();
  });

  it('startUpdate 成功时应返回成功', async () => {
    dataFetchMocks.startUpdate.mockResolvedValue({
      success: true,
      message: '全量更新已启动',
      pid: 12345,
    });

    const res = await fetch(`${server.url}/api/v1/data/manage/update/full`, { method: 'PUT' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.success).toBe(true);
    expect(dataFetchMocks.startUpdate).toHaveBeenCalledWith('full');
  });

  it('startUpdate 抛错时应返回 500', async () => {
    dataFetchMocks.startUpdate.mockRejectedValue(new Error('启动失败'));

    const res = await fetch(`${server.url}/api/v1/data/manage/update/full`, { method: 'PUT' });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('UPDATE_ERROR');
  });
});

// PATCH /update/inc、PUT /update/refetch、PATCH /resume 共享相同的成功/错误结构，
// 通过 describe.each 表驱动，避免重复模板代码。PUT /update/full 因额外断言
// body.data.success 保持独立（见上方 describe 块）。
describe.each([
  ['PATCH', '/update/inc', 'incremental'],
  ['PUT', '/update/refetch', 'full'],
  ['PATCH', '/resume', 'incremental'],
])('dataManageRoutes - %s %s', (method, path, mode) => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });

  afterEach(async () => {
    await server.close();
  });

  it('startUpdate 成功时应返回成功', async () => {
    dataFetchMocks.startUpdate.mockResolvedValue({ success: true, message: '已启动' });

    const res = await fetch(`${server.url}/api/v1/data/manage${path}`, { method });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(dataFetchMocks.startUpdate).toHaveBeenCalledWith(mode);
  });

  it('startUpdate 抛错时应返回 500', async () => {
    dataFetchMocks.startUpdate.mockRejectedValue(new Error('error'));

    const res = await fetch(`${server.url}/api/v1/data/manage${path}`, { method });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('UPDATE_ERROR');
  });
});

describe('dataManageRoutes - POST /update/stop', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });

  afterEach(async () => {
    await server.close();
  });

  it('停止成功时应返回成功', async () => {
    dataFetchMocks.stopUpdate.mockReturnValue({ success: true, message: '更新已停止' });

    const res = await fetch(`${server.url}/api/v1/data/manage/update/stop`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.success).toBe(true);
  });
});

describe('dataManageRoutes - PUT /universe', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });

  afterEach(async () => {
    await server.close();
  });

  it('正常时应返回标的信息', async () => {
    engineServiceMocks.scanMarketStatsFromDb.mockResolvedValue(createMockStats());

    const res = await fetch(`${server.url}/api/v1/data/manage/universe`, { method: 'PUT' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(50);
    expect(body.data.message).toContain('PostgreSQL');
  });

  it('scanMarketStatsFromDb 抛错时应返回 500', async () => {
    engineServiceMocks.scanMarketStatsFromDb.mockRejectedValue(new Error('universe error'));

    const res = await fetch(`${server.url}/api/v1/data/manage/universe`, { method: 'PUT' });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('UNIVERSE_ERROR');
  });

  it('stats 为 null 时 total 应为 0', async () => {
    engineServiceMocks.scanMarketStatsFromDb.mockResolvedValue(null);

    const res = await fetch(`${server.url}/api/v1/data/manage/universe`, { method: 'PUT' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.total).toBe(0);
  });
});

describe('dataManageRoutes - PUT /regenerate-meta', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });

  afterEach(async () => {
    await server.close();
  });

  it('应直接返回成功（数据由 PostgreSQL 实时计算）', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/regenerate-meta`, { method: 'PUT' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('PostgreSQL');
  });
});

describe('dataManageRoutes - 废弃 POST 端点错误路径', () => {
  let server: TestServer;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp('admin');
  });

  afterEach(async () => {
    await server.close();
  });

  it.each([
    ['/update/full', 'post full error'],
    ['/update/inc', 'post inc error'],
    ['/update/refetch', 'post refetch error'],
    ['/resume', 'post resume error'],
  ])('POST %s 抛错时应返回 500', async (path, errorMsg) => {
    dataFetchMocks.startUpdate.mockRejectedValue(new Error(errorMsg));

    const res = await fetch(`${server.url}/api/v1/data/manage${path}`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('UPDATE_ERROR');
  });

  it('POST /universe 抛错时应返回 500', async () => {
    engineServiceMocks.scanMarketStatsFromDb.mockRejectedValue(new Error('post universe error'));

    const res = await fetch(`${server.url}/api/v1/data/manage/universe`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('UNIVERSE_ERROR');
  });

  it('POST /regenerate-meta 应直接返回成功', async () => {
    const res = await fetch(`${server.url}/api/v1/data/manage/regenerate-meta`, { method: 'POST' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain('PostgreSQL');
  });
});
