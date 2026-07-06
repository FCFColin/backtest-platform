/**
 * 租户作用域持久化路由单元测试（ADR-034）
 *
 * 验证 portfolios/configs/runs 路由的 CRUD 行为、校验与 404/400 边界，
 * 并确认 owner 解析（API Key 调用方记为 null）。
 *
 * Mock 策略：mock 三个仓储，在测试 app 内注入 req.tenantId/req.user 模拟鉴权链。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer, type TestRequest } from '../../helpers/expressApp.js';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

const mocks = vi.hoisted(() => ({
  portfolioRepo: {
    listPortfolios: vi.fn(),
    getPortfolio: vi.fn(),
    createPortfolio: vi.fn(),
    updatePortfolio: vi.fn(),
    deletePortfolio: vi.fn(),
  },
  savedConfigRepo: {
    listConfigs: vi.fn(),
    getConfig: vi.fn(),
    createConfig: vi.fn(),
    updateConfig: vi.fn(),
    deleteConfig: vi.fn(),
  },
  backtestRunRepo: {
    listRuns: vi.fn(),
    getRun: vi.fn(),
    createRun: vi.fn(),
    deleteRun: vi.fn(),
  },
}));

vi.mock('../../../packages/backend/src/services/portfolioRepo.js', () => mocks.portfolioRepo);
vi.mock('../../../packages/backend/src/services/savedConfigRepo.js', () => mocks.savedConfigRepo);
vi.mock('../../../packages/backend/src/services/backtestRunRepo.js', () => mocks.backtestRunRepo);
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

import portfolioRoutes from '../../../packages/backend/src/routes/portfolioRoutes.js';
import configRoutes from '../../../packages/backend/src/routes/configRoutes.js';
import runRoutes from '../../../packages/backend/src/routes/runRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';

async function startApp(sub = 'user-1'): Promise<TestServer> {
  return startExpressApp((app) => {
    app.use((req: TestRequest, _res, next) => {
      req.tenantId = ORG;
      req.user = { sub, role: 'analyst', tenant_id: ORG, org_role: 'analyst' };
      next();
    });
    app.use('/api/v1/portfolios', portfolioRoutes);
    app.use('/api/v1/configs', configRoutes);
    app.use('/api/v1/runs', runRoutes);
  });
}

describe('portfolioRoutes', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp();
  });
  afterEach(async () => await server.close());

  it('POST / 创建成功返回 201 并以 user sub 为 owner', async () => {
    mocks.portfolioRepo.createPortfolio.mockResolvedValueOnce({ id: ID, name: '60/40' });
    const res = await fetch(`${server.url}/api/v1/portfolios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '60/40', assets: [{ ticker: 'SPY', weight: 100 }] }),
    });
    expect(res.status).toBe(201);
    expect(mocks.portfolioRepo.createPortfolio).toHaveBeenCalledWith(
      ORG,
      'user-1',
      expect.objectContaining({ name: '60/40' }),
    );
  });

  it('POST / 权重不合法（空 assets）返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/portfolios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', assets: [] }),
    });
    expect(res.status).toBe(400);
    expect(mocks.portfolioRepo.createPortfolio).not.toHaveBeenCalled();
  });

  it('GET /:id 不存在返回 404', async () => {
    mocks.portfolioRepo.getPortfolio.mockResolvedValueOnce(null);
    const res = await fetch(`${server.url}/api/v1/portfolios/${ID}`);
    expect(res.status).toBe(404);
  });

  it('GET /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/portfolios/bad`);
    expect(res.status).toBe(400);
  });

  it('DELETE /:id 成功返回 200', async () => {
    mocks.portfolioRepo.deletePortfolio.mockResolvedValueOnce(true);
    const res = await fetch(`${server.url}/api/v1/portfolios/${ID}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('GET / 返回列表', async () => {
    mocks.portfolioRepo.listPortfolios.mockResolvedValueOnce([{ id: ID, name: '60/40' }]);
    const res = await fetch(`${server.url}/api/v1/portfolios`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it('GET /:id 成功返回 200', async () => {
    mocks.portfolioRepo.getPortfolio.mockResolvedValueOnce({ id: ID, name: '60/40' });
    const res = await fetch(`${server.url}/api/v1/portfolios/${ID}`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.name).toBe('60/40');
  });

  it('PUT /:id 更新成功返回 200', async () => {
    mocks.portfolioRepo.updatePortfolio.mockResolvedValueOnce({ id: ID, name: '80/20' });
    const res = await fetch(`${server.url}/api/v1/portfolios/${ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '80/20',
        assets: [
          { ticker: 'SPY', weight: 80 },
          { ticker: 'BND', weight: 20 },
        ],
      }),
    });
    expect(res.status).toBe(200);
  });

  it('PUT /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/portfolios/bad`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', assets: [{ ticker: 'SPY', weight: 100 }] }),
    });
    expect(res.status).toBe(400);
    expect(mocks.portfolioRepo.updatePortfolio).not.toHaveBeenCalled();
  });

  it('PUT /:id 不存在返回 404', async () => {
    mocks.portfolioRepo.updatePortfolio.mockResolvedValueOnce(null);
    const res = await fetch(`${server.url}/api/v1/portfolios/${ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', assets: [{ ticker: 'SPY', weight: 100 }] }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/portfolios/bad`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(mocks.portfolioRepo.deletePortfolio).not.toHaveBeenCalled();
  });

  it('DELETE /:id 不存在返回 404', async () => {
    mocks.portfolioRepo.deletePortfolio.mockResolvedValueOnce(false);
    const res = await fetch(`${server.url}/api/v1/portfolios/${ID}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('configRoutes', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp();
  });
  afterEach(async () => await server.close());

  it('POST / 创建配置返回 201', async () => {
    mocks.savedConfigRepo.createConfig.mockResolvedValueOnce({ id: ID, name: 'cfg' });
    const res = await fetch(`${server.url}/api/v1/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'cfg', config: { a: 1 } }),
    });
    expect(res.status).toBe(201);
  });

  it('apikey 调用方 owner 应为 null', async () => {
    await server.close();
    server = await startApp('apikey:key-123');
    mocks.savedConfigRepo.createConfig.mockResolvedValueOnce({ id: ID, name: 'cfg' });
    await fetch(`${server.url}/api/v1/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'cfg', config: { a: 1 } }),
    });
    expect(mocks.savedConfigRepo.createConfig).toHaveBeenCalledWith(ORG, null, expect.anything());
  });

  it('GET / 返回列表', async () => {
    mocks.savedConfigRepo.listConfigs.mockResolvedValueOnce([{ id: ID, name: 'cfg' }]);
    const res = await fetch(`${server.url}/api/v1/configs`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it('GET /:id 成功返回 200', async () => {
    mocks.savedConfigRepo.getConfig.mockResolvedValueOnce({ id: ID, name: 'cfg' });
    const res = await fetch(`${server.url}/api/v1/configs/${ID}`);
    expect(res.status).toBe(200);
  });

  it('GET /:id 不存在返回 404', async () => {
    mocks.savedConfigRepo.getConfig.mockResolvedValueOnce(null);
    const res = await fetch(`${server.url}/api/v1/configs/${ID}`);
    expect(res.status).toBe(404);
  });

  it('GET /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/configs/bad`);
    expect(res.status).toBe(400);
  });

  it('PUT /:id 更新成功返回 200', async () => {
    mocks.savedConfigRepo.updateConfig.mockResolvedValueOnce({ id: ID, name: 'cfg2' });
    const res = await fetch(`${server.url}/api/v1/configs/${ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'cfg2', config: { b: 2 } }),
    });
    expect(res.status).toBe(200);
  });

  it('PUT /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/configs/bad`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', config: { a: 1 } }),
    });
    expect(res.status).toBe(400);
    expect(mocks.savedConfigRepo.updateConfig).not.toHaveBeenCalled();
  });

  it('PUT /:id 不存在返回 404', async () => {
    mocks.savedConfigRepo.updateConfig.mockResolvedValueOnce(null);
    const res = await fetch(`${server.url}/api/v1/configs/${ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', config: { a: 1 } }),
    });
    expect(res.status).toBe(404);
  });

  it('DELETE /:id 成功返回 200', async () => {
    mocks.savedConfigRepo.deleteConfig.mockResolvedValueOnce(true);
    const res = await fetch(`${server.url}/api/v1/configs/${ID}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('DELETE /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/configs/bad`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(mocks.savedConfigRepo.deleteConfig).not.toHaveBeenCalled();
  });

  it('DELETE /:id 不存在返回 404', async () => {
    mocks.savedConfigRepo.deleteConfig.mockResolvedValueOnce(false);
    const res = await fetch(`${server.url}/api/v1/configs/${ID}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('POST / 缺失 body 返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(mocks.savedConfigRepo.createConfig).not.toHaveBeenCalled();
  });
});

describe('runRoutes', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp();
  });
  afterEach(async () => await server.close());

  it('GET / 返回历史列表', async () => {
    mocks.backtestRunRepo.listRuns.mockResolvedValueOnce([{ id: ID }]);
    const res = await fetch(`${server.url}/api/v1/runs`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });

  it('POST / 保存运行返回 201', async () => {
    mocks.backtestRunRepo.createRun.mockResolvedValueOnce({ id: ID });
    const res = await fetch(`${server.url}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: { x: 1 } }),
    });
    expect(res.status).toBe(201);
  });

  it('GET /:id 成功返回 200', async () => {
    mocks.backtestRunRepo.getRun.mockResolvedValueOnce({ id: ID });
    const res = await fetch(`${server.url}/api/v1/runs/${ID}`);
    expect(res.status).toBe(200);
  });

  it('GET /:id 不存在返回 404', async () => {
    mocks.backtestRunRepo.getRun.mockResolvedValueOnce(null);
    const res = await fetch(`${server.url}/api/v1/runs/${ID}`);
    expect(res.status).toBe(404);
  });

  it('GET /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/runs/bad`);
    expect(res.status).toBe(400);
  });

  it('DELETE /:id 成功返回 200', async () => {
    mocks.backtestRunRepo.deleteRun.mockResolvedValueOnce(true);
    const res = await fetch(`${server.url}/api/v1/runs/${ID}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
  });

  it('DELETE /:id 非法 UUID 返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/runs/bad`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(mocks.backtestRunRepo.deleteRun).not.toHaveBeenCalled();
  });

  it('DELETE /:id 不存在返回 404', async () => {
    mocks.backtestRunRepo.deleteRun.mockResolvedValueOnce(false);
    const res = await fetch(`${server.url}/api/v1/runs/${ID}`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('POST / 缺失 body 返回 400', async () => {
    const res = await fetch(`${server.url}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(mocks.backtestRunRepo.createRun).not.toHaveBeenCalled();
  });

  it('apikey 调用方 owner 应为 null', async () => {
    await server.close();
    server = await startApp('apikey:key-456');
    mocks.backtestRunRepo.createRun.mockResolvedValueOnce({ id: ID });
    await fetch(`${server.url}/api/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: { x: 1 } }),
    });
    expect(mocks.backtestRunRepo.createRun).toHaveBeenCalledWith(ORG, null, expect.anything());
  });
});
