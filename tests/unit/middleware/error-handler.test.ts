import '../../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loggerMocks } from '../../helpers/loggerFixture.js';

const configMocks = vi.hoisted(() => ({
  NODE_ENV: 'development',
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: configMocks,
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
import { expectProblem } from '../../helpers/routeAssertions.js';
import { DataNotFoundError } from '../../../packages/backend/src/utils/errors.js';
import { TimeoutError } from '../../../packages/backend/src/utils/misc.js';

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
    const body = (res.json as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body).toMatchObject({
      success: false,
      error: {
        type: 'https://backtest.platform/errors/INTERNAL_ERROR',
        title: 'INTERNAL_ERROR',
        status: 500,
        code: 'INTERNAL_ERROR',
      },
    });
    expect(body.error.detail).toBeUndefined();
  });

  it('生产环境应隐藏错误消息（通用消息）', () => {
    configMocks.NODE_ENV = 'production';
    const req = createMockRequest({ method: 'GET', path: '/api/backtest', ip: '10.0.0.1' });
    const res = createMockResponse();
    const next = createMockNext();
    const error = new Error('数据库连接失败');

    errorHandler(error, req, res, next);

    const body = (res.json as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body).toMatchObject({
      success: false,
      error: { title: 'INTERNAL_ERROR' },
    });
    expect(body.error.detail).toBeUndefined();
  });

  it('应遵循 RFC 7807 格式', () => {
    const req = createMockRequest({ path: '/api/test' });
    const res = createMockResponse();
    const next = createMockNext();

    errorHandler(new Error('err'), req, res, next);

    const callArgs = (res.json as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.success).toBe(false);
    expect(callArgs.error).toMatchObject({
      type: expect.stringContaining('https://'),
      title: expect.any(String),
      status: 500,
      code: expect.any(String),
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

  it('ApplicationError 应按其状态码与错误码返回', () => {
    const req = createMockRequest({ path: '/api/test' });
    const res = createMockResponse();
    const next = createMockNext();
    const error = new DataNotFoundError('missing');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ status: 404, code: 'DATA_NOT_FOUND' }),
      }),
    );
  });

  it.each<[string, Error, number, string]>([
    [
      'TimeoutError 应映射为 503 COMPUTE_TIMEOUT',
      new TimeoutError('engine exceeded budget'),
      503,
      'COMPUTE_TIMEOUT',
    ],
    [
      'body-parser 超大实体应映射为 413 PAYLOAD_TOO_LARGE',
      Object.assign(new Error('too large'), { type: 'entity.too.large', status: 413 }),
      413,
      'PAYLOAD_TOO_LARGE',
    ],
  ])('%s', (_name, error, status, code) => {
    const res = createMockResponse();
    errorHandler(error, createMockRequest({ path: '/api/backtest' }), res, createMockNext());
    expectProblem(res, code, status);
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
        error: expect.objectContaining({
          type: 'https://backtest.platform/errors/NOT_FOUND',
          title: 'NOT_FOUND',
          status: 404,
          code: 'NOT_FOUND',
        }),
      }),
    );
  });

  it('应记录 404 日志', () => {
    const req = createMockRequest({ method: 'POST', path: '/api/unknown' });
    const res = createMockResponse();

    notFoundHandler(req, res);

    expect(loggerMocks.debug).toHaveBeenCalledWith(
      { method: 'POST', path: '/api/unknown' },
      '[app] 404 未匹配路由',
    );
  });
});
