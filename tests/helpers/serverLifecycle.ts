import { beforeEach, afterEach } from 'vitest';
import type { TestServer } from './expressApp.js';

/** 注册 beforeEach/afterEach 启动并关闭测试服务器，返回闭包延迟取值 */
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
