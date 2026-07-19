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
import type { Request, Response, NextFunction, Router } from 'express';
import { config } from '../../packages/backend/src/config/index.js';
import { getPool, closeDb } from '../../packages/backend/src/db/pool.js';
import { initSchema } from '../../packages/backend/src/db/migrations.js';
import { startExpressApp, type TestServer } from './expressApp.js';

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
  /** 第二个 owner 用户 UUID（用于"最后一个 owner 保护"场景下安全降级 userId） */
  secondUserId: string;
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

/**
 * 启动 SaaS 集成测试服务器（mock 鉴权 + 路由挂载 + 随机端口监听）
 *
 * 替代各 SaaS 集成测试中重复的：
 *   const app = express();
 *   app.use(express.json());
 *   app.use(mockAuthMiddleware(orgId, userId));
 *   app.use('/api/v1/...', routes);
 *   await new Promise((resolve) => { const server = app.listen(0, () => {...}); });
 *
 * @param orgId - 活跃组织（租户）UUID
 * @param userId - 用户 UUID
 * @param mountPath - 路由挂载路径（如 '/api/v1/configs'）
 * @param router - Express 路由实例
 * @returns 测试服务器句柄（url + close）
 */
export async function startSaasTestServer(
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
