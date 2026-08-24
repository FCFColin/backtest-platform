import type { Express } from 'express';
import {
  errorHandler,
  notFoundHandler,
} from '../../../packages/backend/src/middleware/errorHandler.js';
import { startExpressApp, type TestRequest, type TestServer } from '../expressApp.js';

export interface KitUser {
  sub: string;
  role: string;
  org_role?: string;
  platform_admin?: boolean;
}

export interface MkAppOptions {
  /**
   * 'fake'（默认）：中间件注入 req.user（伪 RBAC，配合被 mock 的 jwtAuth）；
   * 'real'：不注入，由测试文件自身的 jwtAuth mock / 真实认证栈接管。
   */
  rbac?: 'fake' | 'real';
  auth?: { user?: Partial<KitUser>; tenantId?: string };
  configure?: (app: Express) => void;
  bodyLimit?: string;
}

export const DEFAULT_KIT_USER: KitUser = { sub: 'user-1', role: 'analyst' };

/** Express 最小壳：json 解析 + 伪/真 RBAC 开关 + 生产级 ProblemDetails 兜底。 */
export async function mkApp(options: MkAppOptions = {}): Promise<TestServer> {
  const { rbac = 'fake', auth = {}, configure, bodyLimit } = options;
  return startExpressApp(
    (app) => {
      if (rbac === 'fake') {
        app.use((req: TestRequest, _res, next) => {
          req.user = { ...DEFAULT_KIT_USER, ...auth.user };
          if (auth.tenantId !== undefined) req.tenantId = auth.tenantId;
          next();
        });
      }
      configure?.(app);
      app.use(notFoundHandler);
      app.use(errorHandler);
    },
    { bodyLimit },
  );
}
