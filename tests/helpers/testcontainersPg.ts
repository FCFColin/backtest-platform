import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { beforeAll, afterAll } from 'vitest';
import type { Request, Response, NextFunction, Router } from 'express';
import { config } from '../../packages/backend/src/config/index.js';
import { getPool, closeDb } from '../../packages/backend/src/db/pool.js';
import { initSchema } from '../../packages/backend/src/db/migrations.js';
import { startExpressApp, type TestServer } from './expressApp.js';

export interface TestContainerContext {
  container: StartedPostgreSqlContainer;
  /** 迁移/回滚等 DDL 需以超管执行（表属主为 backtest） */
  adminConnectionString: string;
  cleanup: () => Promise<void>;
}

interface SeedData {
  orgId: string;
  userId: string;
  secondUserId: string;
}

export function isDockerAvailable(): boolean {
  // 默认 skip（避免本地 Docker Desktop 故障导致 hook 超时），仅在 CI 或显式设置
  if (process.env.RUN_TESTCONTAINERS !== '1') return false;
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 15000 });
    return true;
  } catch {
    // CI 显式开启容器测试时 docker 不可用 = 测试环境损坏，失败而非静默假绿
    throw new Error('RUN_TESTCONTAINERS=1 但 docker 不可用：集成测试无法执行');
  }
}

export async function setupTestContainer(): Promise<TestContainerContext> {
  const container = await new PostgreSqlContainer('timescale/timescaledb:2.17.2-pg16')
    .withDatabase('backtest_test')
    .withUsername('backtest')
    .withPassword('backtest')
    .start();

  const connectionString = container.getConnectionUri();
  process.env.DATABASE_URL = connectionString;
  (config as { DATABASE_URL: string }).DATABASE_URL = connectionString;
  await closeDb();

  await initSchema();

  // 001_initial_schema 迁移已创建 backtest_app（NOBYPASSRLS）+ 全部授权；
  // 应用层改连非超管 backtest_app，否则超管绕过 RLS 使租户隔离断言失真（ADR-009）
  const appUrl = new URL(connectionString);
  appUrl.username = 'backtest_app';
  appUrl.password = 'change-me-in-deploy';
  const appConnectionString = appUrl.toString();
  process.env.DATABASE_URL = appConnectionString;
  (config as { DATABASE_URL: string }).DATABASE_URL = appConnectionString;
  await closeDb();

  return {
    container,
    adminConnectionString: connectionString,
    cleanup: async () => {
      await closeDb();
      await container.stop();
    },
  };
}

/**
 * 种子数据：创建组织、两个 owner 用户与成员关系
 *
 * 创建两个 owner 是为了在"最后一个 owner 保护"安全约束下，
 * 仍能安全地把 `userId` 降级为 admin（因还有一个 owner 兜底）。
 *
 * @returns 组织 ID 与两个 owner 用户 ID
 */
export async function seedOrgAndUser(): Promise<SeedData> {
  const pool = getPool();
  const orgResult = await pool.query(
    "INSERT INTO organizations (name, slug) VALUES ('Test Org', 'test-org-' || gen_random_uuid()) RETURNING id",
  );
  const userResult = await pool.query(
    "INSERT INTO users (username, password_hash) VALUES ('testuser-' || gen_random_uuid(), 'hash') RETURNING id",
  );
  const secondUserResult = await pool.query(
    "INSERT INTO users (username, password_hash) VALUES ('testuser2-' || gen_random_uuid(), 'hash') RETURNING id",
  );
  const orgId: string = orgResult.rows[0].id;
  const userId: string = userResult.rows[0].id;
  const secondUserId: string = secondUserResult.rows[0].id;
  await pool.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')", [
    orgId,
    userId,
  ]);
  await pool.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')", [
    orgId,
    secondUserId,
  ]);
  return { orgId, userId, secondUserId };
}

function mockAuthMiddleware(orgId: string, userId: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    (req as unknown as { tenantId: string }).tenantId = orgId;
    (req as unknown as { user: unknown }).user = {
      sub: userId,
      role: 'admin',
      tenant_id: orgId,
      org_role: 'owner',
      platform_admin: false,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    next();
  };
}

async function startSaasTestServer(
  orgId: string,
  userId: string,
  mountPath: string,
  router: Router,
): Promise<TestServer> {
  return startExpressApp((app) => {
    app.use(mockAuthMiddleware(orgId, userId));
    app.use(mountPath, router);
  });
}

/**
 * 集成测试常用骨架：起容器 + 种子数据 + SaaS 服务器，并注册 beforeAll/afterAll。
 * 不 Docker 时 beforeAll 跳过（配合 describe.skipIf(!saas.dockerAvailable)）。
 */
export function saasIntegrationServer(routes: Router, mountPath = '/api/v1') {
  const dockerAvailable = isDockerAvailable();
  let ctx: TestContainerContext | null = null;
  let seed: SeedData | null = null;
  let url = '';
  beforeAll(async () => {
    if (!dockerAvailable) return;
    ctx = await setupTestContainer();
    seed = await seedOrgAndUser();
    const server = await startSaasTestServer(seed.orgId, seed.userId, mountPath, routes);
    url = server.url;
  }, 300000);
  afterAll(async () => {
    if (ctx) await ctx.cleanup();
  });
  return {
    dockerAvailable,
    get url() {
      return url;
    },
    get seed() {
      return seed;
    },
  };
}
