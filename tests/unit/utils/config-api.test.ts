import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  lsSave: vi.fn(),
  lsLoad: vi.fn<
    () => { id: string; name: string; savedAt: string; portfolios: never[]; parameters: object }[]
  >(() => []),
  lsDelete: vi.fn(),
  apiFetch: vi.fn(),
  storage: {} as Record<string, string>,
  getState: vi.fn(() => ({ user: { tenantId: 'org_1' } })),
}));

vi.mock('../../../packages/frontend/src/utils/apiClient', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('../../../packages/frontend/src/utils/portfolioStorage', () => ({
  saveNamedConfig: mocks.lsSave,
  loadNamedConfigs: mocks.lsLoad,
  deleteNamedConfig: mocks.lsDelete,
  type: {},
}));
vi.mock('@/store/authStore', () => ({
  useAuthStore: { getState: mocks.getState, setState: vi.fn() },
}));

const TEST_PORTFOLIO = {
  id: 'p1',
  name: 'pf',
  tickers: ['AAPL'],
  weights: [1],
  rebalanceFreq: 'monthly' as const,
} as const;
const TEST_PARAMS = { regimeFilter: false, maxDrawdown: 0.2 };
const LOCAL_CONFIG = {
  id: 'l1',
  name: 'local',
  savedAt: '2025-01-01T00:00:00Z',
  portfolios: [],
  parameters: {},
};

function stubLocalStorage() {
  const s = mocks.storage;
  for (const k of Object.keys(s)) delete s[k];
  globalThis.localStorage = {
    getItem: vi.fn((k: string) => s[k] ?? null),
    setItem: vi.fn((k: string, v: string) => {
      s[k] = v;
    }),
    removeItem: vi.fn((k: string) => {
      delete s[k];
    }),
    clear: vi.fn(() => {
      for (const k of Object.keys(s)) delete s[k];
    }),
    key: vi.fn(() => null),
    get length() {
      return Object.keys(s).length;
    },
  } as unknown as Storage;
}

beforeEach(() => {
  vi.clearAllMocks();
  stubLocalStorage();
  mocks.getState.mockReturnValue({ user: { tenantId: 'org_1' } });
  mocks.lsLoad.mockReturnValue([]);
});

async function importMod() {
  return import('../../../packages/frontend/src/utils/configApi.js');
}

describe('listNamedConfigs', () => {
  it('未登录时直接返回本地配置', async () => {
    mocks.getState.mockReturnValue({ user: null });
    mocks.lsLoad.mockReturnValue([LOCAL_CONFIG]);
    const { listNamedConfigs } = await importMod();
    const result = await listNamedConfigs();
    expect(result).toEqual([LOCAL_CONFIG]);
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('已登录时调用服务端接口', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 's1',
            name: 'server-config',
            config: { portfolios: [TEST_PORTFOLIO], parameters: TEST_PARAMS },
            createdAt: '2025-06-01T00:00:00Z',
          },
        ],
      }),
    });
    const { listNamedConfigs } = await importMod();
    const result = await listNamedConfigs();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('server-config');
  });

  it('服务端返回非 ok 时回退本地', async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    mocks.lsLoad.mockReturnValue([LOCAL_CONFIG]);
    const { listNamedConfigs } = await importMod();
    const result = await listNamedConfigs();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('local');
  });

  it('服务端抛错时回退本地', async () => {
    mocks.apiFetch.mockRejectedValueOnce(new Error('network'));
    mocks.lsLoad.mockReturnValue([LOCAL_CONFIG]);
    const { listNamedConfigs } = await importMod();
    const result = await listNamedConfigs();
    expect(result).toHaveLength(1);
  });

  it('服务端返回 ok 但无 data 字段时返回空数组', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const { listNamedConfigs } = await importMod();
    const result = await listNamedConfigs();
    expect(result).toEqual([]);
  });

  it('服务端返回 data 为 null 时返回空数组', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null }),
    });
    const { listNamedConfigs } = await importMod();
    const result = await listNamedConfigs();
    expect(result).toEqual([]);
  });

  it('服务端返回 config 为 null 时使用空默认值', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 's1', name: 'null-config', config: null, createdAt: '2025-06-01T00:00:00Z' }],
      }),
    });
    const { listNamedConfigs } = await importMod();
    const result = await listNamedConfigs();
    expect(result).toHaveLength(1);
    expect(result[0].portfolios).toEqual([]);
    expect(result[0].parameters).toEqual({});
  });

  it('服务端返回 config 含 null portfolios/parameters 时使用默认值', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 's2',
            name: 'partial-config',
            config: { portfolios: null, parameters: null },
            createdAt: '2025-06-01T00:00:00Z',
          },
        ],
      }),
    });
    const { listNamedConfigs } = await importMod();
    const result = await listNamedConfigs();
    expect(result).toHaveLength(1);
    expect(result[0].portfolios).toEqual([]);
    expect(result[0].parameters).toEqual({});
  });

  it('服务端返回 config 缺 portfolios/parameters 时使用默认值', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 's3',
            name: 'missing-fields',
            config: {},
            createdAt: '2025-06-01T00:00:00Z',
          },
        ],
      }),
    });
    const { listNamedConfigs } = await importMod();
    const result = await listNamedConfigs();
    expect(result).toHaveLength(1);
    expect(result[0].portfolios).toEqual([]);
    expect(result[0].parameters).toEqual({});
  });
});

describe('saveNamedConfigApi', () => {
  it('未登录时写本地', async () => {
    mocks.getState.mockReturnValue({ user: null });
    const { saveNamedConfigApi } = await importMod();
    await saveNamedConfigApi('test', [], {});
    expect(mocks.lsSave).toHaveBeenCalledWith('test', [], {});
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('已登录时写服务端', async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const { saveNamedConfigApi } = await importMod();
    await saveNamedConfigApi('test', [TEST_PORTFOLIO], TEST_PARAMS);
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/v1/configs',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('deleteNamedConfigApi', () => {
  it('未登录时删本地', async () => {
    mocks.getState.mockReturnValue({ user: null });
    const { deleteNamedConfigApi } = await importMod();
    await deleteNamedConfigApi('l1');
    expect(mocks.lsDelete).toHaveBeenCalledWith('l1');
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('已登录时删服务端', async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    const { deleteNamedConfigApi } = await importMod();
    await deleteNamedConfigApi('s1');
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/api/v1/configs/s1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

describe('importLocalConfigsOnce', () => {
  it('已导入过时直接返回', async () => {
    globalThis.localStorage.setItem('bt_configs_imported', 'done');
    const { importLocalConfigsOnce } = await importMod();
    await importLocalConfigsOnce();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('本地无配置时直接标已导入', async () => {
    const { importLocalConfigsOnce } = await importMod();
    await importLocalConfigsOnce();
    expect(globalThis.localStorage.getItem('bt_configs_imported')).toBe('done');
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('有本地配置时逐条迁移', async () => {
    mocks.lsLoad.mockReturnValue([
      {
        id: 'l1',
        name: 'legacy',
        savedAt: '',
        portfolios: [TEST_PORTFOLIO],
        parameters: TEST_PARAMS,
      },
    ]);
    mocks.apiFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { importLocalConfigsOnce } = await importMod();
    await importLocalConfigsOnce();
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
    expect(globalThis.localStorage.getItem('bt_configs_imported')).toBe('done');
  });

  it('未登录时直接返回', async () => {
    mocks.getState.mockReturnValue({ user: null });
    const { importLocalConfigsOnce } = await importMod();
    await importLocalConfigsOnce();
    expect(mocks.apiFetch).not.toHaveBeenCalled();
  });

  it('迁移失败时静默（不抛异常）', async () => {
    mocks.lsLoad.mockReturnValue([
      { id: 'l1', name: 'legacy', savedAt: '', portfolios: [], parameters: {} },
    ]);
    mocks.apiFetch.mockRejectedValueOnce(new Error('server down'));
    const { importLocalConfigsOnce } = await importMod();
    await expect(importLocalConfigsOnce()).resolves.toBeUndefined();
  });
});
