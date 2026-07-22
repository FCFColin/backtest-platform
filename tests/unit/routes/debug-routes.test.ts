/**
 * 调试路由单元测试（ADR-042：debugRoutes 已合并入 healthRoutes）
 *
 * 企业理由：DEBUG 端点暴露进程信息，必须严格鉴权且未配置时不可见。
 * 合并后仍保持原端点路径 /api/v1/debug/health 与鉴权语义不变。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startExpressApp, type TestServer } from '../../helpers/expressApp.js';
import { config } from '../../../packages/backend/src/config/index.js';
import healthRoutes from '../../../packages/backend/src/routes/healthRoutes.js';

describe('healthRoutes (debug endpoint) - GET /api/v1/debug/health', () => {
  let server: TestServer;
  const originalToken = config.DEBUG_AUTH_TOKEN;

  beforeEach(async () => {
    // healthRoutes 挂载于 /api（与生产 app.ts 一致），内部子路径含 /v1/debug/health
    server = await startExpressApp((app) => app.use('/api', healthRoutes));
  });

  afterEach(async () => {
    await server.close();
    config.DEBUG_AUTH_TOKEN = originalToken;
  });

  it('未配置 DEBUG_AUTH_TOKEN 时应返回 404', async () => {
    config.DEBUG_AUTH_TOKEN = '';

    const res = await fetch(`${server.url}/api/v1/debug/health`);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('Bearer token 错误时应返回 401', async () => {
    config.DEBUG_AUTH_TOKEN = 'correct-secret-token';

    const res = await fetch(`${server.url}/api/v1/debug/health`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('有效 DEBUG_AUTH_TOKEN 时应返回 200', async () => {
    config.DEBUG_AUTH_TOKEN = 'correct-secret-token';

    const res = await fetch(`${server.url}/api/v1/debug/health`, {
      headers: { Authorization: 'Bearer correct-secret-token' },
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      node: expect.any(String),
      pid: expect.any(Number),
      uptimeSec: expect.any(Number),
      memory: expect.any(Object),
    });
  });

  it('超长恶意 Bearer token 应返回 401', async () => {
    config.DEBUG_AUTH_TOKEN = 'correct-secret-token';
    const maliciousToken = 'A'.repeat(10000);

    const res = await fetch(`${server.url}/api/v1/debug/health`, {
      headers: { Authorization: `Bearer ${maliciousToken}` },
    });
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });
});
