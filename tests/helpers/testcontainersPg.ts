/**
 * testcontainers PostgreSQL 共享助手（RO-049）
 *
 * 企业理由：多个 SaaS 路由集成测试（portfolios/configs/runs/api-keys/orgs）需要相同的
 * testcontainers PG 启动、schema 初始化、种子数据创建与 Express mock 鉴权中间件逻辑。
 * 提取为共享助手避免 6+ 文件重复 ~50 行相同的容器管理代码，修改时只需改一处。
 *
 * 权衡：每个测试文件仍需在顶部声明 vi.mock(logger)，因 vitest 的 mock 提升是
 * 文件级作用域——helper 中的 import 在测试文件的 mock 提升之后才解析，
 * 因此 logger mock 能正确生效。
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../../packages/backend/src/config/index.js';
import { getPool, initSchema, closeDb } from '../../packages/backend/src/db/index.js';

/** testcontainers PG 容器上下文 */
export interface TestContainerContext {
  /** 已启动的 PG 容器实例 */
  container: StartedPostgreSqlContainer;
  /** 清理容器与连接池 */
  cleanup: () => Promise<void>;
}

/** 种子数据：组织 + 用户 + 成员关系 */
export interface SeedData {
  /** 组织（租户）UUID */
  orgId: string;
  /** 用户 UUID */
  userId: string;
}

/**
 * 检测 Docker 是否可用（docker info 是否成功）
 *
 * @returns Docker 可用返回 true，否则 false
 */
export function isDockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * 启动 testcontainers PostgreSQL 容器并初始化 schema
 *
 * @returns 容器上下文（container + cleanup）
 */
export async function setupTestContainer(): Promise<TestContainerContext> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('backtest_test')
    .withUsername('backtest')
    .withPassword('backtest')
    .start();

  const connectionString = container.getConnectionUri();
  process.env.DATABASE_URL = connectionString;
  (config as { DATABASE_URL: string }).DATABASE_URL = connectionString;
  await closeDb();

  await initSchema();

  return {
    container,
    cleanup: async () => {
      await closeDb();
      await container.stop();
    },
  };
}

/**
 * 种子数据：创建组织、用户与 owner 成员关系
 *
 * @returns 组织 ID 与用户 ID
 */
export async function seedOrgAndUser(): Promise<SeedData> {
  const pool = getPool();
  const orgResult = await pool.query(
    "INSERT INTO organizations (name, slug) VALUES ('Test Org', 'test-org-' || gen_random_uuid()) RETURNING id",
  );
  const userResult = await pool.query(
    "INSERT INTO users (username, password_hash) VALUES ('testuser-' || gen_random_uuid(), 'hash') RETURNING id",
  );
  const orgId: string = orgResult.rows[0].id;
  const userId: string = userResult.rows[0].id;
  await pool.query("INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')", [
    orgId,
    userId,
  ]);
  return { orgId, userId };
}

/**
 * 创建 mock 鉴权中间件，注入 tenantId 与 user 上下文
 *
 * 替代 jwtAuth → resolveTenant → requireTenant → requirePermission 链，
 * 使集成测试无需签发真实 JWT 或解析 API Key 即可调用 SaaS 路由。
 *
 * @param orgId - 活跃组织（租户）UUID
 * @param userId - 用户 UUID
 * @returns Express 中间件
 */
export function mockAuthMiddleware(orgId: string, userId: string) {
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
