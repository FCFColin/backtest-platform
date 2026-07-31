
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { vi } from 'vitest';
import type { AuthenticatedRequest } from '../../packages/backend/src/middleware/jwtAuth.js';
import { EventEmitter } from 'events';

const API_PORT = 15001;

export const API_BASE_URL = `http://localhost:${API_PORT}`;

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export interface TestRequest extends Request {
  tenantId?: string;
  user?: {
    sub: string;
    role: string;
    tenant_id?: string;
    org_role?: string;
    platform_admin?: boolean;
    iat?: number;
    exp?: number;
  };
}

interface StartExpressAppOptions {
  bodyLimit?: string;
}

/**
 * 在随机端口启动 Express 应用，返回 { url, close }
 *
 * 企业理由：统一测试服务器的启动与关闭逻辑，确保：
 * 1. 使用端口 0 让操作系统分配可用端口，避免端口冲突
 * 2. close() 返回 Promise，确保测试 afterEach 中连接完全释放
 * 3. 使用 127.0.0.1 而非 localhost，避免 DNS 解析延迟
 *
 * @param configure - 配置函数，接收 Express 实例，挂载路由/中间件
 * @param options - 可选配置（如 bodyLimit）
 * @returns 测试服务器句柄（url + close）
 */
export async function startExpressApp(
  configure: (app: Express) => void,
  options?: StartExpressAppOptions,
): Promise<TestServer> {
  const app = express();
  app.use(express.json(options?.bodyLimit ? { limit: options.bodyLimit } : undefined));
  configure(app);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
