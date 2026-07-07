import { describe, it, expect, vi, beforeEach } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

vi.mock('../../../packages/backend/src/utils/requestContext.js', () => ({
  getRequestId: vi.fn(() => 'req-123'),
}));

vi.mock('../../../packages/backend/src/utils/tracePropagation.js', () => ({
  getTracePropagationHeaders: vi.fn(() => ({ traceparent: '00-abc-xyz-01' })),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { callService } from '../../../packages/backend/src/utils/httpClient.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

describe('callService', () => {
  it('成功时应返回解析后的 JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' }),
    });
    const r = await callService('http://test:5003', '/api/health');
    expect(r).toEqual({ data: 'ok' });
  });

  it('应注入 trace 和 request-id 头', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    await callService('http://test:5003', '/api/health');
    const fetchOpts = mockFetch.mock.calls[0][1];
    expect(fetchOpts.headers.traceparent).toBe('00-abc-xyz-01');
    expect(fetchOpts.headers['x-request-id']).toBe('req-123');
  });

  it('非 2xx 状态码应返回 null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });
    const r = await callService('http://test:5003', '/api/data');
    expect(r).toBeNull();
  });

  it('网络错误应返回 null', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    const r = await callService('http://test:5003', '/api/data');
    expect(r).toBeNull();
  });

  it('超时应返回 null（AbortError）', async () => {
    mockFetch.mockImplementationOnce(async () => {
      throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    });
    const r = await callService('http://test:5003', '/api/data', {}, 1);
    expect(r).toBeNull();
  });

  it('应传递自定义 options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    await callService('http://test:5003', '/api/data', {
      method: 'POST',
      body: JSON.stringify({ key: 'val' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchOpts = mockFetch.mock.calls[0][1];
    expect(fetchOpts.method).toBe('POST');
    expect(fetchOpts.body).toBe(JSON.stringify({ key: 'val' }));
  });

  it('超时 abort 应触发 AbortController.signal', async () => {
    mockFetch.mockImplementationOnce(async (_url: string, opts: { signal?: AbortSignal }) => {
      expect(opts.signal).toBeDefined();
      expect(opts.signal!.aborted).toBe(false);
      return { ok: true, json: () => Promise.resolve({}) };
    });
    await callService('http://test:5003', '/api/health', {}, 5000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('响应体非 JSON 时应返回解析结果（如果 json 不抛异常）', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve('raw-string'),
    });
    const r = await callService('http://test:5003', '/api/health');
    expect(r).toBe('raw-string');
  });
});
