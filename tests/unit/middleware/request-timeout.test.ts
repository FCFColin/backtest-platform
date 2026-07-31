import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { requestTimeout } from '../../../packages/backend/src/middleware/errorHandler.js';

function createEventMockResponse() {
  const listeners: Record<string, (() => void)[]> = {};
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    headersSent: false,
    req: undefined,
    on: vi.fn((event: string, cb: () => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    emit: (event: string) => {
      (listeners[event] ?? []).forEach((cb) => cb());
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('requestTimeout', () => {
  it('应立即调用 next()，不阻塞请求', () => {
    const middleware = requestTimeout(30_000);
    const req = { method: 'GET', path: '/api/test' };
    const res = createEventMockResponse();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('请求超时后应返回 408 RFC 7807 Problem Detail + Retry-After 头', () => {
    const middleware = requestTimeout(5_000);
    const req = { method: 'POST', path: '/api/v1/backtest/portfolio' };
    const res = createEventMockResponse();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    // 推进时间到超时
    vi.advanceTimersByTime(5_000);

    expect(res.status).toHaveBeenCalledWith(408);
    expect(res.header).toHaveBeenCalledWith('Retry-After', '30');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          type: 'https://backtest.platform/errors/REQUEST_TIMEOUT',
          title: 'Request Timeout',
          status: 408,
          code: 'REQUEST_TIMEOUT',
          detail: 'Request processing exceeded time limit',
        }),
      }),
    );
  });

  it('超时时应输出 Pino warn 日志（含 method/path/timeoutMs）', () => {
    const middleware = requestTimeout(10_000);
    const req = { method: 'GET', path: '/api/v1/data/tickers' };
    const res = createEventMockResponse();
    const next = vi.fn();

    middleware(req as never, res as never, next);
    vi.advanceTimersByTime(10_000);

    expect(loggerMocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/data/tickers',
        timeoutMs: 10_000,
      }),
      'Request timeout: request exceeded time limit',
    );
  });

  it('请求正常完成（finish 事件）后应清除定时器，不发送超时响应', () => {
    const middleware = requestTimeout(10_000);
    const req = { method: 'GET', path: '/api/health' };
    const res = createEventMockResponse();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    // 请求在超时前完成
    res.emit('finish');

    // 推进时间超过超时阈值
    vi.advanceTimersByTime(10_000);

    expect(res.status).not.toHaveBeenCalled();
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it('连接关闭（close 事件）后应清除定时器', () => {
    const middleware = requestTimeout(10_000);
    const req = { method: 'GET', path: '/api/health' };
    const res = createEventMockResponse();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    // 连接关闭
    res.emit('close');

    vi.advanceTimersByTime(10_000);

    expect(res.status).not.toHaveBeenCalled();
  });

  it('headers 已发送时超时不应重复响应', () => {
    const middleware = requestTimeout(5_000);
    const req = { method: 'GET', path: '/api/test' };
    const res = createEventMockResponse();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    // 模拟响应已发送
    res.headersSent = true;

    vi.advanceTimersByTime(5_000);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('默认超时应为 30 秒', () => {
    const middleware = requestTimeout();
    const req = { method: 'GET', path: '/api/test' };
    const res = createEventMockResponse();
    const next = vi.fn();

    middleware(req as never, res as never, next);

    // 29 秒不应超时
    vi.advanceTimersByTime(29_000);
    expect(res.status).not.toHaveBeenCalled();

    // 30 秒应超时
    vi.advanceTimersByTime(1_000);
    expect(res.status).toHaveBeenCalledWith(408);
  });
});
