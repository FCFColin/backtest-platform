/**
 * httpClient 单元测试（callService 超时/降级/4xx 透传）
 *
 * 覆盖：
 * - 成功响应 + trace 头合并 + x-request-id 注入
 * - 4xx RFC 7807 / Go 旧格式 / 非 JSON / 空 body 透传为 UpstreamProblemError
 * - 5xx / 超时（AbortError）/ 网络错误降级返回 null
 * - resp.text() 抛错时兜底为空字符串
 *
 * 权衡：mock getRequestId / getTracePropagationHeaders / logger / global fetch，
 * 不 mock errors.js（UpstreamProblemError / errorMessage 为纯函数，保持真实行为）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  getRequestId: vi.fn(),
  getTracePropagationHeaders: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  },
}));

vi.mock('../../../packages/backend/src/utils/requestContext.js', () => ({
  getRequestId: mocks.getRequestId,
  getTracePropagationHeaders: mocks.getTracePropagationHeaders,
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: mocks.logger,
}));

import { callService } from '../../../packages/backend/src/utils/httpClient.js';

const originalFetch = globalThis.fetch;

interface MockResponseOpts {
  ok: boolean;
  status?: number;
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
}

function makeResponse(opts: MockResponseOpts): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    text: opts.text ?? (() => Promise.resolve('')),
    json: opts.json ?? (() => Promise.resolve(null)),
  } as unknown as Response;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  globalThis.fetch = mocks.fetch as unknown as typeof fetch;
  mocks.getRequestId.mockReturnValue(undefined);
  mocks.getTracePropagationHeaders.mockReturnValue({});
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
});

describe('callService', () => {
  it('成功响应应返回解析后的 JSON 并合并 trace 头与调用方头', async () => {
    mocks.getTracePropagationHeaders.mockReturnValue({ traceparent: 'tp-1' });
    mocks.fetch.mockResolvedValue(
      makeResponse({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    );

    const result = await callService('http://svc', '/api/foo', {
      method: 'POST',
      headers: { 'X-Custom': 'c' },
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://svc/api/foo',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Custom': 'c',
          traceparent: 'tp-1',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('requestId 上下文存在时应附加 x-request-id 头', async () => {
    mocks.getRequestId.mockReturnValue('req-123');
    mocks.fetch.mockResolvedValue(makeResponse({ ok: true, json: async () => ({}) }));

    await callService('http://svc', '/bar');

    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://svc/bar',
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-request-id': 'req-123' }),
      }),
    );
  });

  it('4xx RFC 7807 body 应抛 UpstreamProblemError 携带原始 status/code/title/detail', async () => {
    mocks.fetch.mockResolvedValue(
      makeResponse({
        ok: false,
        status: 422,
        text: async () =>
          JSON.stringify({
            code: 'BACKTEST_EMPTY',
            title: 'Bad Request',
            detail: 'portfolios is empty',
          }),
      }),
    );

    await expect(callService('http://svc', '/bt')).rejects.toMatchObject({
      name: 'UpstreamProblemError',
      status: 422,
      code: 'BACKTEST_EMPTY',
      title: 'Bad Request',
      detail: 'portfolios is empty',
    });
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });

  it('4xx Go 旧格式 body（detail 缺失，error 字段存在）应将 error 作为 detail', async () => {
    mocks.fetch.mockResolvedValue(
      makeResponse({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'go engine error' }),
      }),
    );

    await expect(callService('http://svc', '/bt')).rejects.toMatchObject({
      status: 400,
      code: 'UPSTREAM_ERROR',
      detail: 'go engine error',
    });
  });

  it('4xx 非 JSON body 应将原始文本（截断 500 字符）作为 detail', async () => {
    const text = 'x'.repeat(600);
    mocks.fetch.mockResolvedValue(makeResponse({ ok: false, status: 400, text: async () => text }));

    await expect(callService('http://svc', '/bt')).rejects.toMatchObject({
      status: 400,
      detail: 'x'.repeat(500),
    });
  });

  it('4xx 空 body 应将 `HTTP {status}` 作为 detail', async () => {
    mocks.fetch.mockResolvedValue(makeResponse({ ok: false, status: 404, text: async () => '' }));

    await expect(callService('http://svc', '/bt')).rejects.toMatchObject({
      status: 404,
      detail: 'HTTP 404',
    });
  });

  it('5xx 响应应返回 null 并记录 warn 日志', async () => {
    mocks.fetch.mockResolvedValue(
      makeResponse({ ok: false, status: 503, text: async () => 'upstream down' }),
    );

    const result = await callService('http://svc', '/bt');

    expect(result).toBeNull();
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.stringContaining('HTTP 503'));
  });

  it('5xx 响应 resp.text() 抛错时应兜底为空字符串并返回 null', async () => {
    mocks.fetch.mockResolvedValue(
      makeResponse({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error('stream closed')),
      }),
    );

    const result = await callService('http://svc', '/bt');

    expect(result).toBeNull();
    expect(mocks.logger.warn).toHaveBeenCalled();
  });

  it('AbortError（超时）应返回 null 并记录不含 endpoint 的 warn 日志', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    mocks.fetch.mockRejectedValue(abortErr);

    const result = await callService('http://svc', '/bt');

    expect(result).toBeNull();
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.stringContaining('http://svc 不可用'));
  });

  it('其他网络错误应返回 null 并记录含错误消息的 warn 日志', async () => {
    mocks.fetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await callService('http://svc', '/bt');

    expect(result).toBeNull();
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });
});
