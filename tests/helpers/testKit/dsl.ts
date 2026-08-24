import { expect, it } from 'vitest';
import { signTestToken, validPayload } from '../authFixtures.js';
import { reqJson, type TestServer } from '../expressApp.js';
import { expectProblem, type ApiResult } from './assertions.js';

export interface RouteCase {
  name?: string;
  method?: string;
  path: string;
  role?: string;
  body?: unknown | (() => unknown);
  status?: number;
  code?: string;
  assert?: (r: ApiResult) => void;
}

async function runCase(server: () => TestServer, c: RouteCase): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (c.role) {
    headers.Authorization = `Bearer ${await signTestToken(validPayload({ role: c.role }))}`;
  }
  const r = await reqJson(
    `${server().url}${c.path}`,
    c.method ?? 'GET',
    typeof c.body === 'function' ? (c.body as () => unknown)() : c.body,
    headers,
  );
  return { res: r.res, body: r.body };
}

/** 表驱动路由测试范式：status/code 声明式断言 + 可选自定义 assert。 */
export function runRouteCases(server: () => TestServer, cases: RouteCase[]): void {
  it.each(cases)('$name', async (c) => {
    const r = await runCase(server, c);
    const status = c.status ?? 200;
    if (status < 400) {
      expect(r.res.status).toBe(status);
      expect((r.body as { success?: boolean } | null)?.success).toBe(true);
    } else {
      expectProblem(r, { status, code: c.code });
    }
    await c.assert?.(r);
  });
}

export interface AuthMatrixCase {
  desc?: string;
  role?: string;
  sub?: string;
  orgRole?: string;
  platformAdmin?: boolean;
  tenant?: string;
  method?: string;
  body?: unknown;
  expectedStatus: number;
  expectedCode?: string;
}

/** RBAC 矩阵测试范式：同一端点 × 角色集合 → 期望状态码。 */
export function runAuthMatrix(
  server: () => TestServer,
  spec: { endpoint: string; cases: AuthMatrixCase[] },
): void {
  it.each(spec.cases)('$desc', async (c) => {
    const headers: Record<string, string> = {};
    if (c.role !== undefined || c.platformAdmin) {
      headers.Authorization = `Bearer ${await signTestToken(
        validPayload({
          sub: c.sub ?? 'user-1',
          ...(c.role !== undefined && { role: c.role }),
          ...(c.orgRole !== undefined && { org_role: c.orgRole }),
          ...(c.tenant !== undefined && { tenant_id: c.tenant }),
          ...(c.platformAdmin && { platform_admin: true }),
        }),
      )}`;
    }
    const r = await reqJson(`${server().url}${spec.endpoint}`, c.method ?? 'GET', c.body, headers);
    if (c.expectedStatus < 400) {
      expect(r.res.status).toBe(c.expectedStatus);
      expect((r.body as { success?: boolean } | null)?.success).toBe(true);
    } else {
      expectProblem(r, { status: c.expectedStatus, code: c.expectedCode });
    }
  });
}
