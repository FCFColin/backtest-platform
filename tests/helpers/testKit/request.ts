import { signTestToken, validPayload } from '../authFixtures.js';
import { reqJson, type TestServer } from '../expressApp.js';
import type { KitUser } from './app.js';

export interface AuthedReqOptions extends Partial<KitUser> {
  method?: string;
  path: string;
  tenant?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** 提供时走 x-api-key 认证，否则构造 Bearer JWT */
  apiKey?: string;
}

/** 构造并注入认证头的请求（JWT / x-api-key 双模）。伪 RBAC 下多余的头无害。 */
export async function mkAuthedReq(server: TestServer, o: AuthedReqOptions) {
  const headers: Record<string, string> = { ...o.headers };
  if (o.apiKey) {
    headers['x-api-key'] = o.apiKey;
  } else {
    const token = await signTestToken(
      validPayload({
        sub: o.sub ?? 'user-1',
        role: o.role ?? 'analyst',
        ...(o.org_role !== undefined && { org_role: o.org_role }),
        ...(o.platform_admin !== undefined && { platform_admin: o.platform_admin }),
        ...(o.tenant !== undefined && { tenant_id: o.tenant }),
      }),
    );
    headers.Authorization = `Bearer ${token}`;
  }
  return reqJson(`${server.url}${o.path}`, o.method ?? 'GET', o.body, headers);
}
