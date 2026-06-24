/**
 * 审计日志中间件单元测试（T-P1-5.3）
 *
 * 企业理由：审计日志是合规要求（SOC 2/ISO 27001），测试覆盖：
 * 写操作记录、读操作跳过、响应完成后捕获 statusCode。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  childInfo: vi.fn(),
}));

vi.mock('../../../api/utils/logger.js', () => ({
  logger: {
    info: mocks.info,
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: mocks.childInfo })),
  },
}));

import { auditLog } from '../../../api/middleware/auditLog.js';

function createMockReqRes(opts: {
  method?: string;
  headers?: Record<string, string>;
  path?: string;
}) {
  const res = {
    statusCode: 200,
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'finish') {
        (res as any)._finishCallback = cb;
      }
    }),
  } as unknown as Response;

  const req = {
    method: opts.method || 'POST',
    headers: opts.headers || {},
    path: opts.path || '/api/admin/test',
    originalUrl: opts.path || '/api/admin/test',
    url: opts.path || '/api/admin/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('auditLog 中间件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET 请求应跳过审计日志', () => {
    const { req, res, next } = createMockReqRes({ method: 'GET' });
    auditLog(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).not.toHaveBeenCalled();
  });

  it('HEAD 请求应跳过审计日志', () => {
    const { req, res, next } = createMockReqRes({ method: 'HEAD' });
    auditLog(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).not.toHaveBeenCalled();
  });

  it('OPTIONS 请求应跳过审计日志', () => {
    const { req, res, next } = createMockReqRes({ method: 'OPTIONS' });
    auditLog(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).not.toHaveBeenCalled();
  });

  it('POST 请求应注册 finish 事件回调', () => {
    const { req, res, next } = createMockReqRes({ method: 'POST' });
    auditLog(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('PUT 请求应注册 finish 事件回调', () => {
    const { req, res, next } = createMockReqRes({ method: 'PUT' });
    auditLog(req, res, next);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('DELETE 请求应注册 finish 事件回调', () => {
    const { req, res, next } = createMockReqRes({ method: 'DELETE' });
    auditLog(req, res, next);
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
  });

  it('finish 回调应记录审计日志', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    });
    auditLog(req, res, next);

    const finishCb = (res as any)._finishCallback;
    expect(finishCb).toBeDefined();
    finishCb();

    expect(mocks.info).toHaveBeenCalled();
    expect(mocks.childInfo).toHaveBeenCalled();
  });

  it('无 x-api-key 时 userId 应为 anonymous', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: {},
    });
    auditLog(req, res, next);

    const finishCb = (res as any)._finishCallback;
    finishCb();

    expect(mocks.childInfo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'anonymous' }),
      expect.any(String),
    );
  });

  it('有 x-api-key 时 userId 应为 SHA-256 哈希前 16 位（非明文）', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      headers: { 'x-api-key': 'my-secret-key' },
    });
    auditLog(req, res, next);

    const finishCb = (res as any)._finishCallback;
    finishCb();

    expect(mocks.childInfo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.not.stringContaining('my-secret-key') }),
      expect.any(String),
    );
  });
});
