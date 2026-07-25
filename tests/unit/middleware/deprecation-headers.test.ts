/**
 * P2-05 单元测试：API 弃用响应头中间件
 *
 * 企业理由：弃用头（RFC 8594）是客户端迁移的唯一信号来源，
 * 错误的头值会导致客户端迁移失败或过早放弃兼容端点。
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createDeprecationMiddleware } from '../../../packages/backend/src/middleware/deprecationHeaders.js';

function createMockRes(): Response {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    getHeader: vi.fn((name: string) => headers[name]),
    headers,
  };
  return res as unknown as Response;
}

describe('P2-05: createDeprecationMiddleware', () => {
  it('应设置 Deprecation 头为指定日期', () => {
    const middleware = createDeprecationMiddleware({
      deprecated: '2025-01-01',
    });
    const res = createMockRes();
    const next = vi.fn();

    middleware({} as Request, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Deprecation', '2025-01-01');
    expect(next).toHaveBeenCalled();
  });

  it('应设置 Sunset 头（当提供时）', () => {
    const middleware = createDeprecationMiddleware({
      deprecated: '2025-01-01',
      sunset: '2026-01-01',
    });
    const res = createMockRes();
    const next = vi.fn();

    middleware({} as Request, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Sunset', '2026-01-01');
  });

  it('应设置 Link 头指向替代端点（当提供 successor 时）', () => {
    const middleware = createDeprecationMiddleware({
      deprecated: 'true',
      successor: '/api/v1/new-endpoint',
    });
    const res = createMockRes();
    const next = vi.fn();

    middleware({} as Request, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Link',
      '</api/v1/new-endpoint>; rel="successor-version"',
    );
  });

  it('不提供 sunset/successor 时不应设置对应头', () => {
    const middleware = createDeprecationMiddleware({
      deprecated: 'true',
    });
    const res = createMockRes();
    const next = vi.fn();

    middleware({} as Request, res, next);

    expect(res.setHeader).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('Deprecation', 'true');
  });

  it('应调用 next() 继续中间件链', () => {
    const middleware = createDeprecationMiddleware({ deprecated: 'true' });
    const res = createMockRes();
    const next = vi.fn();

    middleware({} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
