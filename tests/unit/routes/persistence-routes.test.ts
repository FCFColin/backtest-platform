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
  backtestRunRepo: { listRuns: vi.fn(), getRun: vi.fn(), createRun: vi.fn(), deleteRun: vi.fn() },
}));
vi.mock('../../../packages/backend/src/repositories/portfolioRepo.js', () => mocks.portfolioRepo);
vi.mock(
  '../../../packages/backend/src/repositories/savedConfigRepo.js',
  () => mocks.savedConfigRepo,
);
vi.mock(
  '../../../packages/backend/src/repositories/backtestRunRepo.js',
  () => mocks.backtestRunRepo,
);
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));

vi.mock('../../../packages/backend/src/middleware/jwtAuth.js', () => ({
  jwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalJwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  assignGuestReadonly: (_req: unknown, _res: unknown, next: () => void) => next(),
  auditLog: (_req: unknown, _res: unknown, next: () => void) => next(),
  idempotencyKey: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../../packages/backend/src/middleware/tenantContext.js', () => ({
  resolveTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  hasTenant: vi.fn(() => true),
}));

vi.mock('../../../packages/backend/src/middleware/rbac.js', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  Permission: {
    BACKTEST_RUN: 'backtest:run',
    ADMIN_ACCESS: 'admin:access',
    DATA_READ: 'data:read',
  },
}));

vi.mock('../../../packages/backend/src/middleware/quota.js', () => ({
  enforceQuota: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import workspaceRoutes from '../../../packages/backend/src/routes/workspaceRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';
const JH = { 'Content-Type': 'application/json' };

async function startApp(sub = 'user-1'): Promise<TestServer> {
  return startExpressApp((app) => {
    app.use((req: TestRequest, _res, next) => {
      req.tenantId = ORG;
      req.user = { sub, role: 'analyst', tenant_id: ORG, org_role: 'analyst' };
      next();
    });
    app.use('/api/v1', workspaceRoutes);
  });
}
async function reqJson(url: string, method: string, body?: unknown) {
  const init: RequestInit = { method, headers: JH };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  return { res, body: await res.json().catch(() => null) };
}

describe('portfolioRoutes', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp();
  });
  afterEach(async () => await server.close());
  const base = () => `${server.url}/api/v1/portfolios`;

  it('POST / 创建成功返回 201 并以 user sub 为 owner', async () => {
    mocks.portfolioRepo.createPortfolio.mockResolvedValueOnce({ id: ID, name: '60/40' });
    const { res } = await reqJson(base(), 'POST', {
      name: '60/40',
      assets: [{ ticker: 'SPY', weight: 100 }],
    });
    expect(res.status).toBe(201);
    expect(mocks.portfolioRepo.createPortfolio).toHaveBeenCalledWith(
      ORG,
      'user-1',
      expect.objectContaining({ name: '60/40' }),
    );
  });
  it('POST / 权重不合法（空 assets）返回 400', async () => {
    const { res } = await reqJson(base(), 'POST', { name: 'x', assets: [] });
    expect(res.status).toBe(400);
    expect(mocks.portfolioRepo.createPortfolio).not.toHaveBeenCalled();
  });
  it('GET / 返回列表', async () => {
    mocks.portfolioRepo.listPortfolios.mockResolvedValueOnce([{ id: ID, name: '60/40' }]);
    const { res, body } = await reqJson(base(), 'GET');
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });
  it('GET /:id 成功返回 200', async () => {
    mocks.portfolioRepo.getPortfolio.mockResolvedValueOnce({ id: ID, name: '60/40' });
    const { res, body } = await reqJson(`${base()}/${ID}`, 'GET');
    expect(res.status).toBe(200);
    expect(body.data.name).toBe('60/40');
  });
  it('GET /:id 不存在返回 404', async () => {
    mocks.portfolioRepo.getPortfolio.mockResolvedValueOnce(null);
    const { res } = await reqJson(`${base()}/${ID}`, 'GET');
    expect(res.status).toBe(404);
  });
  it.each([
    ['GET', 'getPortfolio'],
    ['PUT', 'updatePortfolio'],
    ['DELETE', 'deletePortfolio'],
  ])('/:id 非法 UUID 返回 400（%s）', async (method, repoFn) => {
    const { res } = await reqJson(
      `${base()}/bad`,
      method,
      method === 'GET' ? undefined : { name: 'x', assets: [{ ticker: 'SPY', weight: 100 }] },
    );
    expect(res.status).toBe(400);
    expect(mocks.portfolioRepo[repoFn as keyof typeof mocks.portfolioRepo]).not.toHaveBeenCalled();
  });
  it('PUT /:id 更新成功返回 200', async () => {
    mocks.portfolioRepo.updatePortfolio.mockResolvedValueOnce({ id: ID, name: '80/20' });
    const { res } = await reqJson(`${base()}/${ID}`, 'PUT', {
      name: '80/20',
      assets: [
        { ticker: 'SPY', weight: 80 },
        { ticker: 'BND', weight: 20 },
      ],
    });
    expect(res.status).toBe(200);
  });
  it('PUT /:id 不存在返回 404', async () => {
    mocks.portfolioRepo.updatePortfolio.mockResolvedValueOnce(null);
    const { res } = await reqJson(`${base()}/${ID}`, 'PUT', {
      name: 'x',
      assets: [{ ticker: 'SPY', weight: 100 }],
    });
    expect(res.status).toBe(404);
  });
  it('DELETE /:id 成功返回 200', async () => {
    mocks.portfolioRepo.deletePortfolio.mockResolvedValueOnce(true);
    const { res } = await reqJson(`${base()}/${ID}`, 'DELETE');
    expect(res.status).toBe(200);
  });
  it('DELETE /:id 不存在返回 404', async () => {
    mocks.portfolioRepo.deletePortfolio.mockResolvedValueOnce(false);
    const { res } = await reqJson(`${base()}/${ID}`, 'DELETE');
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
  const base = () => `${server.url}/api/v1/configs`;

  it('POST / 创建配置返回 201', async () => {
    mocks.savedConfigRepo.createConfig.mockResolvedValueOnce({ id: ID, name: 'cfg' });
    const { res } = await reqJson(base(), 'POST', { name: 'cfg', config: { a: 1 } });
    expect(res.status).toBe(201);
  });
  it('apikey 调用方 owner 应为 null', async () => {
    await server.close();
    server = await startApp('apikey:key-123');
    mocks.savedConfigRepo.createConfig.mockResolvedValueOnce({ id: ID, name: 'cfg' });
    await reqJson(base(), 'POST', { name: 'cfg', config: { a: 1 } });
    expect(mocks.savedConfigRepo.createConfig).toHaveBeenCalledWith(ORG, null, expect.anything());
  });
  it('GET / 返回列表', async () => {
    mocks.savedConfigRepo.listConfigs.mockResolvedValueOnce([{ id: ID, name: 'cfg' }]);
    const { res, body } = await reqJson(base(), 'GET');
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });
  it('GET /:id 成功返回 200', async () => {
    mocks.savedConfigRepo.getConfig.mockResolvedValueOnce({ id: ID, name: 'cfg' });
    const { res } = await reqJson(`${base()}/${ID}`, 'GET');
    expect(res.status).toBe(200);
  });
  it('GET /:id 不存在返回 404', async () => {
    mocks.savedConfigRepo.getConfig.mockResolvedValueOnce(null);
    const { res } = await reqJson(`${base()}/${ID}`, 'GET');
    expect(res.status).toBe(404);
  });
  it.each([
    ['GET', 'getConfig'],
    ['PUT', 'updateConfig'],
    ['DELETE', 'deleteConfig'],
  ])('/:id 非法 UUID 返回 400（%s）', async (method, repoFn) => {
    const { res } = await reqJson(
      `${base()}/bad`,
      method,
      method === 'GET' ? undefined : { name: 'x', config: { a: 1 } },
    );
    expect(res.status).toBe(400);
    expect(
      mocks.savedConfigRepo[repoFn as keyof typeof mocks.savedConfigRepo],
    ).not.toHaveBeenCalled();
  });
  it('PUT /:id 更新成功返回 200', async () => {
    mocks.savedConfigRepo.updateConfig.mockResolvedValueOnce({ id: ID, name: 'cfg2' });
    const { res } = await reqJson(`${base()}/${ID}`, 'PUT', { name: 'cfg2', config: { b: 2 } });
    expect(res.status).toBe(200);
  });
  it('PUT /:id 不存在返回 404', async () => {
    mocks.savedConfigRepo.updateConfig.mockResolvedValueOnce(null);
    const { res } = await reqJson(`${base()}/${ID}`, 'PUT', { name: 'x', config: { a: 1 } });
    expect(res.status).toBe(404);
  });
  it('DELETE /:id 成功返回 200', async () => {
    mocks.savedConfigRepo.deleteConfig.mockResolvedValueOnce(true);
    const { res } = await reqJson(`${base()}/${ID}`, 'DELETE');
    expect(res.status).toBe(200);
  });
  it('DELETE /:id 不存在返回 404', async () => {
    mocks.savedConfigRepo.deleteConfig.mockResolvedValueOnce(false);
    const { res } = await reqJson(`${base()}/${ID}`, 'DELETE');
    expect(res.status).toBe(404);
  });
  it('POST / 缺失 body 返回 400', async () => {
    const { res } = await reqJson(base(), 'POST', {});
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
  const base = () => `${server.url}/api/v1/runs`;

  it('GET / 返回历史列表', async () => {
    mocks.backtestRunRepo.listRuns.mockResolvedValueOnce([{ id: ID }]);
    const { res, body } = await reqJson(base(), 'GET');
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
  });
  it('POST / 保存运行返回 201', async () => {
    mocks.backtestRunRepo.createRun.mockResolvedValueOnce({ id: ID });
    const { res } = await reqJson(base(), 'POST', { request: { x: 1 } });
    expect(res.status).toBe(201);
  });
  it('GET /:id 成功返回 200', async () => {
    mocks.backtestRunRepo.getRun.mockResolvedValueOnce({ id: ID });
    const { res } = await reqJson(`${base()}/${ID}`, 'GET');
    expect(res.status).toBe(200);
  });
  it('GET /:id 不存在返回 404', async () => {
    mocks.backtestRunRepo.getRun.mockResolvedValueOnce(null);
    const { res } = await reqJson(`${base()}/${ID}`, 'GET');
    expect(res.status).toBe(404);
  });
  it.each([
    ['GET', 'getRun'],
    ['DELETE', 'deleteRun'],
  ])('/:id 非法 UUID 返回 400（%s）', async (method, repoFn) => {
    const { res } = await reqJson(`${base()}/bad`, method);
    expect(res.status).toBe(400);
    expect(
      mocks.backtestRunRepo[repoFn as keyof typeof mocks.backtestRunRepo],
    ).not.toHaveBeenCalled();
  });
  it('DELETE /:id 成功返回 200', async () => {
    mocks.backtestRunRepo.deleteRun.mockResolvedValueOnce(true);
    const { res } = await reqJson(`${base()}/${ID}`, 'DELETE');
    expect(res.status).toBe(200);
  });
  it('DELETE /:id 不存在返回 404', async () => {
    mocks.backtestRunRepo.deleteRun.mockResolvedValueOnce(false);
    const { res } = await reqJson(`${base()}/${ID}`, 'DELETE');
    expect(res.status).toBe(404);
  });
  it('POST / 缺失 body 返回 400', async () => {
    const { res } = await reqJson(base(), 'POST', {});
    expect(res.status).toBe(400);
    expect(mocks.backtestRunRepo.createRun).not.toHaveBeenCalled();
  });
  it('apikey 调用方 owner 应为 null', async () => {
    await server.close();
    server = await startApp('apikey:key-456');
    mocks.backtestRunRepo.createRun.mockResolvedValueOnce({ id: ID });
    await reqJson(base(), 'POST', { request: { x: 1 } });
    expect(mocks.backtestRunRepo.createRun).toHaveBeenCalledWith(ORG, null, expect.anything());
  });
});
