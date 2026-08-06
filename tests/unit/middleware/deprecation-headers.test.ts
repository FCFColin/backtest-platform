import { describe, it, expect, vi } from 'vitest';
import { createDeprecationMiddleware } from '../../../packages/backend/src/middleware/miscMiddleware.js';

interface MockResponse {
  headers: Record<string, string>;
  setHeader: (name: string, value: string) => void;
}

function createMockRes(): MockResponse {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    }),
  };
}

function createMockNext(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

describe('createDeprecationMiddleware — RFC 8594 废弃响应头', () => {
  it('应设置 Deprecation 头为指定日期', () => {
    const middleware = createDeprecationMiddleware({ deprecated: '2026-01-01' });
    const res = createMockRes();
    const next = createMockNext();

    middleware({} as never, res as never, next as never);

    expect(res.setHeader).toHaveBeenCalledWith('Deprecation', '2026-01-01');
    expect(res.headers['deprecation']).toBe('2026-01-01');
  });

  it('应设置 Sunset 头为指定关闭日期', () => {
    const middleware = createDeprecationMiddleware({
      deprecated: 'true',
      sunset: '2027-01-01',
    });
    const res = createMockRes();
    const next = createMockNext();

    middleware({} as never, res as never, next as never);

    expect(res.headers['deprecation']).toBe('true');
    expect(res.headers['sunset']).toBe('2027-01-01');
  });

  it('应设置 Link 头指向 successor-version', () => {
    const middleware = createDeprecationMiddleware({
      deprecated: '2026-01-01',
      sunset: '2027-01-01',
      successor: '/api/v2/new-endpoint',
    });
    const res = createMockRes();
    const next = createMockNext();

    middleware({} as never, res as never, next as never);

    expect(res.headers['link']).toBe('</api/v2/new-endpoint>; rel="successor-version"');
  });

  it('未配置 sunset/successor 时不设置对应头', () => {
    const middleware = createDeprecationMiddleware({ deprecated: 'true' });
    const res = createMockRes();
    const next = createMockNext();

    middleware({} as never, res as never, next as never);

    expect(res.headers['deprecation']).toBe('true');
    expect(res.headers['sunset']).toBeUndefined();
    expect(res.headers['link']).toBeUndefined();
  });

  it('中间件应调用 next() 传递控制权给后续路由', () => {
    const middleware = createDeprecationMiddleware({ deprecated: '2026-01-01' });
    const res = createMockRes();
    const next = createMockNext();

    middleware({} as never, res as never, next as never);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
