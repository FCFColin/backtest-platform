import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startExpressApp, reqJson, injectAuth, type TestServer } from '../../helpers/expressApp.js';

const mocks = vi.hoisted(() => ({
  repos: {
    portfolios: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), del: vi.fn() },
    configs: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), del: vi.fn() },
    runs: { list: vi.fn(), get: vi.fn(), create: vi.fn(), del: vi.fn() },
  },
}));
vi.mock('../../../packages/backend/src/repositories/portfolioRepo.js', () => ({
  listPortfolios: mocks.repos.portfolios.list,
  getPortfolio: mocks.repos.portfolios.get,
  createPortfolio: mocks.repos.portfolios.create,
  updatePortfolio: mocks.repos.portfolios.update,
  deletePortfolio: mocks.repos.portfolios.del,
}));
vi.mock('../../../packages/backend/src/repositories/savedConfigRepo.js', () => ({
  listConfigs: mocks.repos.configs.list,
  getConfig: mocks.repos.configs.get,
  createConfig: mocks.repos.configs.create,
  updateConfig: mocks.repos.configs.update,
  deleteConfig: mocks.repos.configs.del,
}));
vi.mock('../../../packages/backend/src/repositories/backtestRunRepo.js', () => ({
  listRuns: mocks.repos.runs.list,
  getRun: mocks.repos.runs.get,
  createRun: mocks.repos.runs.create,
  deleteRun: mocks.repos.runs.del,
}));
import '../../helpers/middlewareMocks.js';
import workspaceRoutes from '../../../packages/backend/src/routes/workspaceRoutes.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const ID = '22222222-2222-2222-2222-222222222222';

async function startApp(sub = 'user-1'): Promise<TestServer> {
  return startExpressApp((app) => {
    app.use(injectAuth({ sub, role: 'analyst', tenantId: ORG, orgRole: 'analyst' }));
    app.use('/api/v1', workspaceRoutes);
  });
}

interface ResourceRepo {
  list: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
}
interface ResourceSpec {
  label: string;
  path: string;
  repo: ResourceRepo;
  createBody: () => Record<string, unknown>;
  putBody?: () => Record<string, unknown>;
  owner?: boolean;
  missingBody400?: boolean;
  apikeyOwnerNull?: boolean;
  apikeySub?: string;
}

function crudSuite({
  label,
  path,
  repo,
  createBody,
  putBody,
  owner,
  missingBody400,
  apikeyOwnerNull,
  apikeySub = 'apikey:key-123',
}: ResourceSpec) {
  describe(`${label} CRUD`, () => {
    let server: TestServer;
    beforeEach(async () => {
      vi.clearAllMocks();
      server = await startApp();
    });
    afterEach(async () => await server.close());
    const base = () => `${server.url}/api/v1/${path}`;

    it('POST / 创建成功返回 201', async () => {
      repo.create.mockResolvedValueOnce({ id: ID });
      const { res } = await reqJson(base(), 'POST', createBody());
      expect(res.status).toBe(201);
      if (owner)
        expect(repo.create).toHaveBeenCalledWith(
          ORG,
          'user-1',
          expect.objectContaining(createBody()),
        );
    });
    if (missingBody400) {
      it('POST / 缺失 body 返回 400', async () => {
        const { res } = await reqJson(base(), 'POST', {});
        expect(res.status).toBe(400);
        expect(repo.create).not.toHaveBeenCalled();
      });
    }
    if (apikeyOwnerNull) {
      it('apikey 调用方 owner 应为 null', async () => {
        await server.close();
        server = await startApp(apikeySub);
        repo.create.mockResolvedValueOnce({ id: ID });
        await reqJson(base(), 'POST', createBody());
        expect(repo.create).toHaveBeenCalledWith(ORG, null, expect.anything());
      });
    }
    it('GET / 返回列表', async () => {
      repo.list.mockResolvedValueOnce([{ id: ID }]);
      const { res, body } = await reqJson(base(), 'GET');
      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(1);
    });
    it('GET /:id 成功返回 200', async () => {
      repo.get.mockResolvedValueOnce({ id: ID });
      const { res } = await reqJson(`${base()}/${ID}`, 'GET');
      expect(res.status).toBe(200);
    });
    it('GET /:id 不存在返回 404', async () => {
      repo.get.mockResolvedValueOnce(null);
      const { res } = await reqJson(`${base()}/${ID}`, 'GET');
      expect(res.status).toBe(404);
    });
    const invalidRows: Array<
      [string, ReturnType<typeof vi.fn>, (() => Record<string, unknown>) | undefined]
    > = [
      ['GET', repo.get, undefined],
      ['DELETE', repo.del, undefined],
    ];
    if (putBody && repo.update) invalidRows.splice(1, 0, ['PUT', repo.update, putBody]);
    it.each(invalidRows)('/:id 非法 UUID 返回 400（%s）', async (_method, repoFn, body) => {
      const { res } = await reqJson(`${base()}/bad`, _method, body?.());
      expect(res.status).toBe(400);
      expect(repoFn).not.toHaveBeenCalled();
    });
    if (putBody && repo.update) {
      it('PUT /:id 更新成功返回 200', async () => {
        repo.update!.mockResolvedValueOnce({ id: ID });
        const { res } = await reqJson(`${base()}/${ID}`, 'PUT', putBody());
        expect(res.status).toBe(200);
      });
      it('PUT /:id 不存在返回 404', async () => {
        repo.update!.mockResolvedValueOnce(null);
        const { res } = await reqJson(`${base()}/${ID}`, 'PUT', putBody());
        expect(res.status).toBe(404);
      });
    }
    it('DELETE /:id 成功返回 200', async () => {
      repo.del.mockResolvedValueOnce(true);
      const { res } = await reqJson(`${base()}/${ID}`, 'DELETE');
      expect(res.status).toBe(200);
    });
    it('DELETE /:id 不存在返回 404', async () => {
      repo.del.mockResolvedValueOnce(false);
      const { res } = await reqJson(`${base()}/${ID}`, 'DELETE');
      expect(res.status).toBe(404);
    });
  });
}

crudSuite({
  label: 'portfolios',
  path: 'portfolios',
  repo: mocks.repos.portfolios,
  createBody: () => ({ name: '60/40', assets: [{ ticker: 'SPY', weight: 100 }] }),
  putBody: () => ({
    name: '80/20',
    assets: [
      { ticker: 'SPY', weight: 80 },
      { ticker: 'BND', weight: 20 },
    ],
  }),
  owner: true,
});
crudSuite({
  label: 'configs',
  path: 'configs',
  repo: mocks.repos.configs,
  createBody: () => ({ name: 'cfg', config: { a: 1 } }),
  putBody: () => ({ name: 'cfg2', config: { b: 2 } }),
  missingBody400: true,
  apikeyOwnerNull: true,
});
crudSuite({
  label: 'runs',
  path: 'runs',
  repo: mocks.repos.runs,
  createBody: () => ({ request: { x: 1 } }),
  missingBody400: true,
  apikeyOwnerNull: true,
  apikeySub: 'apikey:key-456',
});

describe('portfolios 特有校验', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp();
  });
  afterEach(async () => await server.close());

  it('POST / 权重不合法（空 assets）返回 400', async () => {
    const { res } = await reqJson(`${server.url}/api/v1/portfolios`, 'POST', {
      name: 'x',
      assets: [],
    });
    expect(res.status).toBe(400);
    expect(mocks.repos.portfolios.create).not.toHaveBeenCalled();
  });
});

describe('workspace 错误与参数场景', () => {
  let server: TestServer;
  beforeEach(async () => {
    vi.clearAllMocks();
    server = await startApp();
  });
  afterEach(async () => await server.close());
  const apiPath = (k: 'portfolios' | 'configs' | 'runs'): string => `${server.url}/api/v1/${k}`;

  it.each(['portfolios', 'configs', 'runs'] as const)('GET /%s 服务错误返回 500', async (k) => {
    mocks.repos[k].list.mockRejectedValueOnce(new Error('db fail'));
    const { res: r } = await reqJson(apiPath(k), 'GET');
    expect(r.status).toBe(500);
  });
  it.each(['portfolios', 'configs', 'runs'] as const)('GET /%s/:id 服务错误返回 500', async (k) => {
    mocks.repos[k].get.mockRejectedValueOnce(new Error('db fail'));
    const { res: r } = await reqJson(`${apiPath(k)}/${ID}`, 'GET');
    expect(r.status).toBe(500);
  });
  it('GET /runs 应支持 limit 查询参数与 NaN 回退', async () => {
    mocks.repos.runs.list.mockResolvedValueOnce([]);
    await reqJson(`${apiPath('runs')}?limit=10`, 'GET');
    expect(mocks.repos.runs.list).toHaveBeenCalledWith(ORG, 10, 0);
    mocks.repos.runs.list.mockResolvedValueOnce([]);
    await reqJson(`${apiPath('runs')}?limit=abc`, 'GET');
    expect(mocks.repos.runs.list).toHaveBeenCalledWith(ORG, 50, 0);
  });
  it.each(['portfolios', 'configs', 'runs'] as const)(
    'DELETE /%s/:id 成功返回删除确认',
    async (k) => {
      mocks.repos[k].del.mockResolvedValueOnce(true);
      const { res: r, body } = await reqJson(`${apiPath(k)}/${ID}`, 'DELETE');
      expect(r.status).toBe(200);
      expect(body.data).toEqual({ id: ID, deleted: true });
    },
  );
});
