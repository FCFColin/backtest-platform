import express, { type Express, type Request, type Router } from 'express';
import { vi, beforeEach, afterEach } from 'vitest';

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

export async function reqJson(
  url: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(url, init);
  return { res, body: await res.json().catch(() => null) };
}

export const postJson = async (url: string, body: unknown) => {
  const { res, body: json } = await reqJson(url, 'POST', body);
  return { res, json };
};

interface UseTestServerOpts {
  auth?: { user?: Partial<NonNullable<TestRequest['user']>>; tenantId?: string };
  clearMocks?: boolean;
  configure?: (app: Express) => void;
}

export function useTestServer(mountPath: string, routes: Router, opts: UseTestServerOpts = {}) {
  let server!: TestServer;
  beforeEach(async () => {
    if (opts.clearMocks !== false) vi.clearAllMocks();
    server = await startExpressApp((app) => {
      if (opts.auth) {
        app.use((req: TestRequest, _res, next) => {
          if (opts.auth!.user) req.user = { sub: 'user-1', role: 'admin', ...opts.auth!.user };
          if (opts.auth!.tenantId !== undefined) req.tenantId = opts.auth!.tenantId;
          next();
        });
      }
      opts.configure?.(app);
      app.use(mountPath, routes);
    });
  });
  afterEach(async () => {
    await server?.close();
  });
  const base = (p: string) => `${server.url}${mountPath}${p}`;
  return {
    url: () => server.url,
    get: (p: string, h: Record<string, string> = {}) => reqJson(base(p), 'GET', undefined, h),
    post: (p: string, body?: unknown, h: Record<string, string> = {}) =>
      reqJson(base(p), 'POST', body, h),
    del: (p: string, h: Record<string, string> = {}) => reqJson(base(p), 'DELETE', undefined, h),
  };
}
