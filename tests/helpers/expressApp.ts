/**
 * 测试辅助：Express 应用工厂
 *
 * 企业理由：22 个路由测试文件各自定义了近乎相同的 startApp() 函数，
 * 在随机端口启动 Express 应用并返回 { url, close }。
 * 每次修改（如增加 body parser、调整关闭逻辑）需逐文件修改，易遗漏。
 * 本模块提供统一的 startExpressApp 函数，消除重复。
 *
 * 用法：
 *   import { startExpressApp } from '../helpers/expressApp.js';
 *   import healthRoutes from '../../../packages/backend/src/routes/healthRoutes.js';
 *   const server = await startExpressApp(app => app.use('/api', healthRoutes));
 */

import express, { type Express, type Request } from 'express';

/** 启动后的测试服务器句柄 */
export interface TestServer {
  /** 服务器基础 URL（如 http://127.0.0.1:34567） */
  url: string;
  /** 关闭服务器（返回 Promise 以确保连接完全释放） */
  close: () => Promise<void>;
}

/**
 * 测试用 Request 类型，扩展 Express Request 以支持测试中注入的鉴权/租户属性。
 *
 * 企业理由：路由测试需要在 req 上注入 tenantId/user 等属性模拟鉴权链，
 * 使用 any 会丢失类型安全。此类型集中定义测试可用的扩展属性，
 * 消除 22+ 个路由测试文件中的 `req: any` 反模式。
 */
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

/** startExpressApp 的可选配置 */
interface StartExpressAppOptions {
  /** 请求体大小限制（如 '10mb'），默认不设限制使用 Express 默认值 */
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
