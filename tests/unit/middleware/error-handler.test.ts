import { describe, it, expect, vi, beforeEach } from 'vitest';

const configMocks = vi.hoisted(() => ({
  NODE_ENV: 'development',
}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: configMocks,
}));

vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: loggerMocks,
}));

import {
  createMockRequest,
  createMockResponse,
  createMockNext,
} from '../../helpers/expressMocks.js';

import {
  errorHandler,
  notFoundHandler,
} from '../../../packages/backend/src/middleware/errorHandler.js';

beforeEach(() => {
  vi.clearAllMocks();
  configMocks.NODE_ENV = 'development';
});

describe('errorHandler', () => {
  it('开发环境应暴露错误消息', () => {
    const req = createMockRequest({ method: 'GET', path: '/api/test', ip: '127.0.0.1' });
    const res = createMockResponse();
    const next = createMockNext();
    const error = new Error('测试错误详情');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          type: 'https://backtest.platform/errors/internal-error',
          title: 'Internal Server Error',
          status: 500,
          code: 'INTERNAL_ERROR',
          detail: '测试错误详情',
        }),
      }),
    );
  });

  it('生产环境应隐藏错误消息（通用消息）', () => {
    configMocks.NODE_ENV = 'production';
    const req = createMockRequest({ method: 'GET', path: '/api/backtest', ip: '10.0.0.1' });
    const res = createMockResponse();
    const next = createMockNext();
    const error = new Error('数据库连接失败');

    errorHandler(error, req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          detail: 'An internal server error occurred',
        }),
      }),
    );
  });

  it('应遵循 RFC 7807 格式', () => {
    const req = createMockRequest({ path: '/api/test' });
    const res = createMockResponse();
    const next = createMockNext();

    errorHandler(new Error('err'), req, res, next);

    const callArgs = (res.json as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs).toMatchObject({
      success: false,
      error: {
        type: expect.stringContaining('https://'),
        title: expect.any(String),
        status: 500,
        code: expect.any(String),
        detail: expect.any(String),
      },
    });
  });

  it('应记录错误日志包含请求上下文', () => {
    const req = createMockRequest({
      method: 'POST',
      path: '/api/backtest/run',
      ip: '192.168.1.1',
      id: 'req-abc-123',
    });
    const res = createMockResponse();
    const next = createMockNext();
    const error = new Error('timeout');

    errorHandler(error, req, res, next);

    expect(loggerMocks.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        requestId: 'req-abc-123',
        method: 'POST',
        path: '/api/backtest/run',
        ip: '192.168.1.1',
      }),
      '[Server Error]',
    );
  });

  it('错误消息超过 200 字符应截断', () => {
    const req = createMockRequest({});
    const res = createMockResponse();
    const next = createMockNext();
    const error = new Error('x'.repeat(500));

    errorHandler(error, req, res, next);

    const callArgs = (res.json as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.error.detail.length).toBeLessThanOrEqual(200);
  });
});

describe('notFoundHandler', () => {
  it('应返回 404 RFC 7807 格式', () => {
    const req = createMockRequest({ method: 'GET', path: '/api/nonexistent' });
    const res = createMockResponse();

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          type: 'https://backtest.platform/errors/not-found',
          title: 'Not Found',
          status: 404,
          code: 'NOT_FOUND',
          detail: 'The requested GET resource was not found',
        },
      }),
    );
  });

  it('应记录 404 日志', () => {
    const req = createMockRequest({ method: 'POST', path: '/api/unknown' });
    const res = createMockResponse();

    notFoundHandler(req, res);

    expect(loggerMocks.info).toHaveBeenCalledWith(
      { method: 'POST', path: '/api/unknown' },
      '[app] 404 未匹配路由',
    );
  });
});
