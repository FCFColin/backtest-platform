import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiFetch,
  getApiKey,
  setApiKey,
  clearApiKey,
  ADMIN_API_KEY_STORAGE,
} from '../../../src/utils/apiClient.js';

// ===== Mock localStorage =====
function createLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
}

const localStorageMock = createLocalStorageMock();
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock);
  vi.stubGlobal('fetch', mockFetch);
  localStorageMock.clear();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ===== 常量 =====
describe('ADMIN_API_KEY_STORAGE 常量', () => {
  it('值为 admin_api_key', () => {
    expect(ADMIN_API_KEY_STORAGE).toBe('admin_api_key');
  });
});

// ===== getApiKey =====
describe('getApiKey', () => {
  it('未设置时返回空字符串', () => {
    expect(getApiKey()).toBe('');
  });

  it('设置后返回解码后的 API Key', () => {
    const key = 'test-api-key-123';
    localStorage.setItem(ADMIN_API_KEY_STORAGE, btoa(key));
    expect(getApiKey()).toBe(key);
  });

  it('localStorage 抛错时返回空字符串', () => {
    localStorageMock.getItem.mockImplementationOnce(() => {
      throw new Error('localStorage unavailable');
    });
    expect(getApiKey()).toBe('');
  });

  it('存储的值非 base64 时返回空字符串', () => {
    localStorage.setItem(ADMIN_API_KEY_STORAGE, '!!!not-base64!!!');
    expect(getApiKey()).toBe('');
  });
});

// ===== setApiKey =====
describe('setApiKey', () => {
  it('保存 base64 编码的 API Key', () => {
    const key = 'my-secret-key';
    setApiKey(key);
    expect(localStorage.getItem(ADMIN_API_KEY_STORAGE)).toBe(btoa(key));
  });

  it('空字符串也能保存', () => {
    setApiKey('');
    expect(localStorage.getItem(ADMIN_API_KEY_STORAGE)).toBe(btoa(''));
  });

  it('特殊字符的 API Key 也能保存', () => {
    const key = 'key-with-!@#$%^&*()';
    setApiKey(key);
    expect(localStorage.getItem(ADMIN_API_KEY_STORAGE)).toBe(btoa(key));
    expect(getApiKey()).toBe(key);
  });

  it('localStorage 抛错时不抛异常', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('localStorage unavailable');
    });
    expect(() => setApiKey('key')).not.toThrow();
  });
});

// ===== clearApiKey =====
describe('clearApiKey', () => {
  it('清除已保存的 API Key', () => {
    setApiKey('to-be-cleared');
    clearApiKey();
    expect(localStorage.getItem(ADMIN_API_KEY_STORAGE)).toBeNull();
  });

  it('未设置时也不抛错', () => {
    expect(() => clearApiKey()).not.toThrow();
  });

  it('localStorage 抛错时不抛异常', () => {
    localStorageMock.removeItem.mockImplementationOnce(() => {
      throw new Error('localStorage unavailable');
    });
    expect(() => clearApiKey()).not.toThrow();
  });
});

// ===== apiFetch - 请求构造 =====
describe('apiFetch - 请求构造', () => {
  it('无 API Key 时不附加 x-api-key 头', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    await apiFetch('https://example.com/api');

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/api');
    expect(init.headers.get('x-api-key')).toBeNull();
  });

  it('有 API Key 时自动附加 x-api-key 头', async () => {
    setApiKey('my-api-key');
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    await apiFetch('https://example.com/api');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('x-api-key')).toBe('my-api-key');
  });

  it('调用方显式传入 x-api-key 时不被覆盖', async () => {
    setApiKey('auto-key');
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    await apiFetch('https://example.com/api', {
      headers: { 'x-api-key': 'explicit-key' },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('x-api-key')).toBe('explicit-key');
  });

  it('调用方传入大写 X-Api-Key 时也不被覆盖', async () => {
    setApiKey('auto-key');
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    await apiFetch('https://example.com/api', {
      headers: { 'X-Api-Key': 'explicit-key' },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('x-api-key')).toBe('explicit-key');
  });

  it('保留其他自定义请求头', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    await apiFetch('https://example.com/api', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer token',
      },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('Content-Type')).toBe('application/json');
    expect(init.headers.get('Authorization')).toBe('Bearer token');
  });

  it('传递 method 和 body', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    const body = JSON.stringify({ foo: 'bar' });
    await apiFetch('https://example.com/api', {
      method: 'POST',
      body,
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(body);
  });

  it('支持 Request 对象作为输入', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    const req = new Request('https://example.com/api');
    await apiFetch(req);

    expect(mockFetch.mock.calls[0][0]).toBe(req);
  });

  it('无 init 参数时也能正常调用', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    await apiFetch('https://example.com/api');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers).toBeInstanceOf(Headers);
  });

  it('init.headers 为 undefined 时正常工作', async () => {
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    await apiFetch('https://example.com/api', { headers: undefined });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('init.headers 为 Headers 对象时正常工作', async () => {
    setApiKey('my-key');
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    const headers = new Headers({ 'Content-Type': 'application/json' });
    await apiFetch('https://example.com/api', { headers });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('Content-Type')).toBe('application/json');
    expect(init.headers.get('x-api-key')).toBe('my-key');
  });

  it('init.headers 为数组时正常工作', async () => {
    setApiKey('my-key');
    mockFetch.mockResolvedValueOnce(new Response('{}'));
    await apiFetch('https://example.com/api', {
      headers: [['Content-Type', 'application/json']],
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('Content-Type')).toBe('application/json');
    expect(init.headers.get('x-api-key')).toBe('my-key');
  });
});

// ===== apiFetch - 响应处理 =====
describe('apiFetch - 响应处理', () => {
  it('成功返回 Response 对象', async () => {
    const response = new Response('{"success":true}', { status: 200 });
    mockFetch.mockResolvedValueOnce(response);
    const result = await apiFetch('https://example.com/api');
    expect(result).toBe(response);
    expect(result.ok).toBe(true);
  });

  it('4xx 响应原样返回（由调用方处理）', async () => {
    const response = new Response('{"error":"Not Found"}', { status: 404 });
    mockFetch.mockResolvedValueOnce(response);
    const result = await apiFetch('https://example.com/api');
    expect(result.status).toBe(404);
    expect(result.ok).toBe(false);
  });

  it('5xx 响应原样返回（由调用方处理）', async () => {
    const response = new Response('{"error":"Server Error"}', { status: 500 });
    mockFetch.mockResolvedValueOnce(response);
    const result = await apiFetch('https://example.com/api');
    expect(result.status).toBe(500);
    expect(result.ok).toBe(false);
  });

  it('网络错误时抛出异常', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    await expect(apiFetch('https://example.com/api')).rejects.toThrow('Network error');
  });

  it('fetch 抛非 Error 值时也抛出', async () => {
    mockFetch.mockRejectedValueOnce('string error');
    await expect(apiFetch('https://example.com/api')).rejects.toBe('string error');
  });
});

// ===== apiFetch - 边界情况 =====
describe('apiFetch - 边界情况', () => {
  it('空响应体也能正常返回', async () => {
    const response = new Response(null, { status: 200 });
    mockFetch.mockResolvedValueOnce(response);
    const result = await apiFetch('https://example.com/api');
    expect(result.status).toBe(200);
    expect(await result.text()).toBe('');
  });

  it('malformed JSON 响应原样返回（由调用方解析）', async () => {
    const response = new Response('{not valid json', { status: 200 });
    mockFetch.mockResolvedValueOnce(response);
    const result = await apiFetch('https://example.com/api');
    expect(result.ok).toBe(true);
    await expect(result.json()).rejects.toThrow();
  });

  it('null 响应（fetch 返回 null）时原样返回', async () => {
    mockFetch.mockResolvedValueOnce(null);
    const result = await apiFetch('https://example.com/api');
    expect(result).toBeNull();
  });

  it('有 API Key 时对每个请求都附加头', async () => {
    setApiKey('persisted-key');
    mockFetch.mockResolvedValue(new Response('{}'));

    await apiFetch('https://example.com/api/1');
    await apiFetch('https://example.com/api/2');
    await apiFetch('https://example.com/api/3');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    for (const call of mockFetch.mock.calls) {
      expect(call[1].headers.get('x-api-key')).toBe('persisted-key');
    }
  });
});
