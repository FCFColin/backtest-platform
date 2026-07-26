/**
 * 弃用响应头中间件单元测试（P1-4, ADR-046）
 *
 * 验证 `createDeprecationMiddleware` 正确设置 RFC 8594 标准的
 * Deprecation/Sunset/Link 响应头。
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createDeprecationMiddleware } from '../../../packages/backend/src/middleware/deprecationHeaders.js';

function createApp(config: Parameters<typeof createDeprecationMiddleware>[0]) {
  const app = express();
  app.use('/deprecated', createDeprecationMiddleware(config));
  app.get('/deprecated', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('createDeprecationMiddleware — RFC 8594 废弃响应头', () => {
  it('应设置 Deprecation 头为指定日期', async () => {
    const app = createApp({ deprecated: '2026-01-01' });
    const res = await request(app).get('/deprecated');
    expect(res.headers['deprecation']).toBe('2026-01-01');
  });

  it('应设置 Sunset 头为指定关闭日期', async () => {
    const app = createApp({ deprecated: 'true', sunset: '2027-01-01' });
    const res = await request(app).get('/deprecated');
    expect(res.headers['deprecation']).toBe('true');
    expect(res.headers['sunset']).toBe('2027-01-01');
  });

  it('应设置 Link 头指向 successor-version', async () => {
    const app = createApp({
      deprecated: '2026-01-01',
      sunset: '2027-01-01',
      successor: '/api/v2/new-endpoint',
    });
    const res = await request(app).get('/deprecated');
    expect(res.headers['link']).toBe('</api/v2/new-endpoint>; rel="successor-version"');
  });

  it('未配置 sunset/successor 时不设置对应头', async () => {
    const app = createApp({ deprecated: 'true' });
    const res = await request(app).get('/deprecated');
    expect(res.headers['deprecation']).toBe('true');
    expect(res.headers['sunset']).toBeUndefined();
    expect(res.headers['link']).toBeUndefined();
  });

  it('中间件应调用 next() 传递控制权给后续路由', async () => {
    const app = createApp({ deprecated: '2026-01-01' });
    const res = await request(app).get('/deprecated');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
