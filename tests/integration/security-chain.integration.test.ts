import '../helpers/loggerMock.js';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

import { generateToken } from '../../packages/backend/src/middleware/jwtSigner.js';
import { isAccessTokenRevokedForUser } from '../../packages/backend/src/middleware/tokenStore.js';
import { getPool } from '../../packages/backend/src/db/pool.js';
import {
  isDockerAvailable,
  setupTestContainer,
  seedOrgAndUser,
  type TestContainerContext,
} from '../helpers/testcontainersPg.js';
import { startExpressApp, type TestServer } from '../helpers/expressApp.js';
import workspaceRoutes from '../../packages/backend/src/routes/workspaceRoutes.js';

// 安全链其余部分全部真实：JWT 校验（RS256）→ 租户解析 → RBAC → 仓库 → RLS。
// 仅撤销检查依赖 Redis（容器未覆盖），mock 为未撤销，其余会话状态走真实 DB。
vi.mock('../../packages/backend/src/middleware/tokenStore.js', { spy: true });

const dockerAvailable = isDockerAvailable();

describe.skipIf(!dockerAvailable)('安全链集成：真实 JWT → 租户解析 → RLS 跨租户拒绝', () => {
  let ctx: TestContainerContext;
  let server: TestServer;
  let orgA: string;
  let orgB: string;
  let tokenA: string;
  let tokenB: string;
  let baseUrl = '';

  beforeAll(async () => {
    vi.mocked(isAccessTokenRevokedForUser).mockResolvedValue(false);
    ctx = await setupTestContainer();
    const seed = await seedOrgAndUser();
    orgA = seed.orgId;
    const pool = getPool();
    const orgBRes = await pool.query(
      "INSERT INTO organizations (name, slug) VALUES ('Org B', 'org-b-' || gen_random_uuid()) RETURNING id",
    );
    orgB = orgBRes.rows[0].id;
    await pool.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')", [
      orgB,
      seed.userId,
    ]);
    tokenA = await generateToken(seed.userId, 'admin', { tenantId: orgA, orgRole: 'owner' });
    tokenB = await generateToken(seed.userId, 'admin', { tenantId: orgB, orgRole: 'owner' });
    server = await startExpressApp((app) => {
      app.use('/api/v1', workspaceRoutes);
    });
    baseUrl = server.url;
  }, 300000);

  afterAll(async () => {
    await server?.close();
    await ctx.cleanup();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const createPortfolio = async (token: string, name: string) =>
    fetch(`${baseUrl}/api/v1/portfolios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth(token) },
      body: JSON.stringify({ name, assets: [{ ticker: 'VTI', weight: 100 }] }),
    });

  it('Org A 真实 JWT 创建 portfolio 返回 201', async () => {
    const res = await createPortfolio(tokenA, 'Chain A');
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.name).toBe('Chain A');
  });

  it('Org B 真实 JWT 的列表不含 Org A 数据（跨租户拒绝）', async () => {
    const res = await fetch(`${baseUrl}/api/v1/portfolios`, { headers: auth(tokenB) });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { name: string }[] };
    expect(data).toHaveLength(0);
  });

  it('Org A 列表可见自己的 portfolio（RLS 未误伤同租户）', async () => {
    const res = await fetch(`${baseUrl}/api/v1/portfolios`, { headers: auth(tokenA) });
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { name: string }[] };
    expect(data.map((p) => p.name)).toContain('Chain A');
  });

  it('Org B 创建后 A 的列表仍不包含 B 的数据', async () => {
    const res = await createPortfolio(tokenB, 'Chain B');
    expect(res.status).toBe(201);
    const resA = await fetch(`${baseUrl}/api/v1/portfolios`, { headers: auth(tokenA) });
    const { data } = (await resA.json()) as { data: { name: string }[] };
    expect(data.map((p) => p.name)).toEqual(['Chain A']);
  });

  it('无凭证请求返回 401（MISSING_CREDENTIALS）', async () => {
    const res = await fetch(`${baseUrl}/api/v1/portfolios`);
    expect(res.status).toBe(401);
  });
});
