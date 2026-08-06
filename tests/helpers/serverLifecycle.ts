import { beforeEach, afterEach } from 'vitest';
import type { TestServer } from './expressApp.js';

/**
 * 注册 beforeEach/afterEach 启动并关闭测试服务器。
 * 返回按需取 server 的 getter —— vitest 钩子在 describe 外层已注册，
 * 测试体运行时才可读 server，故用闭包延迟取值（同 expressApp.ts useTestServer 风格）。
 */
export function withServer(boot: () => Promise<TestServer>): () => TestServer {
  let server!: TestServer;
  beforeEach(async () => {
    server = await boot();
  });
  afterEach(async () => {
    await server.close();
  });
  return () => server;
}
