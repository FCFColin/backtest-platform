import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('../../../packages/frontend/src/store/toastStore.js', () => ({
  useToastStore: {
    getState: () => ({ addToast: mocks.addToast }),
  },
}));

import {
  apiFetch,
  apiPostJSON,
  setTokens,
  clearTokens,
  getAccessToken,
} from '../../../packages/frontend/src/utils/apiClient.js';

const originalFetch = globalThis.fetch;

interface MockResponseOpts {
  ok: boolean;
  status?: number;
  body?: unknown;
  textFn?: () => Promise<string>;
}

function makeResponse(opts: MockResponseOpts): Response {
  const bodyStr = JSON.stringify(opts.body ?? null);
  const textFn = opts.textFn ?? (() => Promise.resolve(bodyStr));
  const resp = {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 400),
    text: textFn,
    json: async () => JSON.parse(await textFn()),
    clone: function () {
      return makeResponse(opts);
    },
  };
  return resp as unknown as Response;
}

beforeEach(() => {
  vi.resetAllMocks();
  clearTokens();
  globalThis.fetch = mocks.fetch as unknown as typeof fetch;
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function lastFetchInit(): RequestInit {
  const call = mocks.fetch.mock.calls.at(-1);
  return (call?.[1] as RequestInit) ?? {};
}

describe('apiFetch', () => {
  it('已登录 + sessionStorage 有 API Key 时附加 Authorization 与 x-api-key 头', async () => {
    setTokens('jwt-token');
    sessionStorage.setItem('admin_api_key', btoa('secret-key'));
    mocks.fetch.mockResolvedValue(makeResponse({ ok: true, body: {} }));

    await apiFetch('/api/admin/foo');

    expect(mocks.fetch).toHaveBeenCalledWith('/api/admin/foo', expect.anything());
    const headers = lastFetchInit().headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer jwt-token');
    expect(headers.get('x-api-key')).toBe('secret-key');
  });

  it('sessionStorage 为空时应从 localStorage 读取 API Key 且不附加 Authorization', async () => {
    localStorage.setItem('admin_api_key', btoa('local-key'));
    mocks.fetch.mockResolvedValue(makeResponse({ ok: true, body: {} }));

    await apiFetch('/api/foo');

    const headers = lastFetchInit().headers as Headers;
    expect(headers.get('x-api-key')).toBe('local-key');
    expect(headers.has('Authorization')).toBe(false);
  });

  it('已登录 + 401 + 刷新成功应重试一次返回新响应', async () => {
    setTokens('expired');
    const firstResp = makeResponse({ ok: false, status: 401, body: {} });
    const secondResp = makeResponse({ ok: true, body: { ok: true } });
    mocks.fetch
      .mockResolvedValueOnce(firstResp)
      .mockResolvedValueOnce(
        makeResponse({ ok: true, body: { success: true, data: { accessToken: 'new-at' } } }),
      )
      .mockResolvedValueOnce(secondResp);

    const res = await apiFetch('/api/foo');

    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBe('new-at');
    expect(res).toBe(secondResp);
  });

  it('已登录 + 401 + 刷新失败应返回原 401 响应（不重试）', async () => {
    setTokens('expired');
    const resp401 = makeResponse({ ok: false, status: 401, body: {} });
    mocks.fetch
      .mockResolvedValueOnce(resp401)
      .mockResolvedValueOnce(makeResponse({ ok: false, status: 401, body: {} }));

    const res = await apiFetch('/api/foo');

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(getAccessToken()).toBe('');
    expect(res).toBe(resp401);
  });

  it('调用方显式传入 Authorization / x-api-key 头不被覆盖', async () => {
    setTokens('should-not-be-used');
    sessionStorage.setItem('admin_api_key', btoa('should-not-be-used'));
    mocks.fetch.mockResolvedValue(makeResponse({ ok: true, body: {} }));

    await apiFetch('/api/foo', {
      headers: { Authorization: 'Custom', 'x-api-key': 'Custom-Key' },
    });

    const headers = lastFetchInit().headers as Headers;
    expect(headers.get('Authorization')).toBe('Custom');
    expect(headers.get('x-api-key')).toBe('Custom-Key');
  });

  it('非 2xx 响应含 error.detail 应弹错误 Toast', async () => {
    mocks.fetch.mockResolvedValue(
      makeResponse({
        ok: false,
        status: 400,
        body: { error: { detail: 'invalid param' } },
      }),
    );

    await apiFetch('/api/foo');

    expect(mocks.addToast).toHaveBeenCalledWith('error', 'invalid param');
  });

  it('degraded=true 应弹警告 Toast（含 degradedWarning）', async () => {
    mocks.fetch.mockResolvedValue(
      makeResponse({
        ok: true,
        body: { degraded: true, degradedWarning: 'partial outage' },
      }),
    );

    await apiFetch('/api/foo');

    expect(mocks.addToast).toHaveBeenCalledWith('warning', 'partial outage');
  });
});

describe('apiPostJSON', () => {
  it('成功响应应返回 json.data', async () => {
    mocks.fetch.mockResolvedValue(
      makeResponse({
        ok: true,
        body: { success: true, data: { id: 1 } },
      }),
    );

    const result = await apiPostJSON<{ id: number }>('/api/foo', { x: 1 });

    expect(result).toEqual({ id: 1 });
  });

  it('HTTP 非 2xx 应抛 `HTTP ${status}`', async () => {
    mocks.fetch.mockResolvedValue(makeResponse({ ok: false, status: 500, body: {} }));

    await expect(apiPostJSON('/api/foo', {})).rejects.toThrow('HTTP 500');
  });

  it('success=false 应抛 error（无 error 时抛默认 errorMsg）', async () => {
    mocks.fetch.mockResolvedValueOnce(
      makeResponse({
        ok: true,
        body: { success: false, error: 'specific error' },
      }),
    );
    await expect(apiPostJSON('/api/foo', {})).rejects.toThrow('specific error');

    mocks.fetch.mockResolvedValueOnce(makeResponse({ ok: true, body: { success: false } }));
    await expect(apiPostJSON('/api/foo', {}, 'fallback')).rejects.toThrow('fallback');
  });
});
