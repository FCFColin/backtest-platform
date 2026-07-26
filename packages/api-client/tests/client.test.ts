import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaseApiClient } from '../src/client.js';
import { BacktestApiError } from '../src/errors.js';

const BASE_PATH = 'http://localhost:5001/api/v1';

/** 构造一个 JSON Response，方便 mock fetch 返回 */
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('BaseApiClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds request with method, path, headers and body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true } }));

    const client = new BaseApiClient({ basePath: BASE_PATH });
    await client.request('POST', '/foo', { hello: 'world' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_PATH}/foo`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ hello: 'world' }));
    const headers = init.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('attaches Bearer token from accessToken', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

    const client = new BaseApiClient({
      basePath: BASE_PATH,
      accessToken: 'jwt-token-123',
    });
    await client.request('GET', '/me');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer jwt-token-123');
    expect(headers.get('x-api-key')).toBeNull();
  });

  it('attaches API key in x-api-key header', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

    const client = new BaseApiClient({
      basePath: BASE_PATH,
      apiKey: 'org-key-456',
    });
    await client.request('GET', '/me');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('x-api-key')).toBe('org-key-456');
    expect(headers.get('Authorization')).toBeNull();
  });

  it('attaches both JWT and API key when both provided', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

    const client = new BaseApiClient({
      basePath: BASE_PATH,
      accessToken: 'jwt-token-123',
      apiKey: 'org-key-456',
    });
    await client.request('GET', '/me');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer jwt-token-123');
    expect(headers.get('x-api-key')).toBe('org-key-456');
  });

  it('serializes request body and deserializes JSON response', async () => {
    const payload = { a: 1, nested: { b: [2, 3] } };
    const responseData = { success: true, data: { value: 42 } };
    mockFetch.mockResolvedValueOnce(jsonResponse(responseData));

    const client = new BaseApiClient({ basePath: BASE_PATH });
    const result = await client.request<typeof responseData>('POST', '/echo', payload);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    // 请求体被 JSON 序列化
    expect(init.body).toBe(JSON.stringify(payload));
    // 响应体被反序列化为对象
    expect(result).toEqual(responseData);
    expect(result.data.value).toBe(42);
  });

  it('throws BacktestApiError on non-2xx response with status and body', async () => {
    const problem = {
      success: false,
      error: { type: 'about:blank', title: 'Unauthorized', status: 401, code: 'AUTH_INVALID' },
    };
    mockFetch.mockResolvedValueOnce(
      jsonResponse(problem, { status: 401, statusText: 'Unauthorized' }),
    );

    const client = new BaseApiClient({ basePath: BASE_PATH });
    await expect(client.request('GET', '/protected')).rejects.toMatchObject({
      name: 'BacktestApiError',
      status: 401,
      statusText: 'Unauthorized',
      body: problem,
    });
  });

  it('BacktestApiError is instanceof Error and BacktestApiError', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: false, error: {} }, { status: 500 }));

    const client = new BaseApiClient({ basePath: BASE_PATH });
    try {
      await client.request('GET', '/boom');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BacktestApiError);
      expect(err).toBeInstanceOf(Error);
      expect((err as BacktestApiError).status).toBe(500);
    }
  });

  it('wraps network failures as BacktestApiError with status 0', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const client = new BaseApiClient({ basePath: BASE_PATH });
    await expect(client.request('GET', '/down')).rejects.toMatchObject({
      name: 'BacktestApiError',
      status: 0,
    });
  });

  it('appends query params to the URL and omits undefined values', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: [] }));

    const client = new BaseApiClient({ basePath: BASE_PATH });
    await client.request('GET', '/search', undefined, {
      q: 'spy',
      limit: 5,
      active: true,
      empty: undefined,
    });

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    const search = new URL(url).searchParams;
    expect(search.get('q')).toBe('spy');
    expect(search.get('limit')).toBe('5');
    expect(search.get('active')).toBe('true');
    expect(search.has('empty')).toBe(false);
  });

  it('does not set Content-Type or body for GET without body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

    const client = new BaseApiClient({ basePath: BASE_PATH });
    await client.request('GET', '/items');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
    const headers = init.headers as Headers;
    expect(headers.get('Content-Type')).toBeNull();
  });

  it('trims trailing slashes from basePath', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

    const client = new BaseApiClient({ basePath: `${BASE_PATH}///` });
    await client.request('GET', '/x');

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_PATH}/x`);
  });

  it('allows caller-provided headers without losing auth headers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true, data: null }));

    const client = new BaseApiClient({
      basePath: BASE_PATH,
      accessToken: 'jwt',
    });
    await client.request('POST', '/idempotent', { x: 1 }, undefined, {
      'Idempotency-Key': 'abc-123',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('Idempotency-Key')).toBe('abc-123');
    expect(headers.get('Authorization')).toBe('Bearer jwt');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('requires basePath in constructor', () => {
    expect(() => new BaseApiClient({ basePath: '' })).toThrow(/basePath is required/);
  });
});
