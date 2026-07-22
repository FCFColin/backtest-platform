/**
 * tenant.ts RLS 强制点单元测试（RO-027 / ADR-032）
 *
 * 企业理由：withTenant 是多租户隔离的唯一注入点，此前 6 个 repo 测试均 mock 掉 PG client，
 * 不验证 set_config('app.current_tenant_id', $1, true) 真实生效。本测试用 testcontainers PG
 * 验证 009 迁移定义的 RLS 策略在 set_config 后生效（跨租户读零行 / 跨租户写被 WITH CHECK 拒绝），
 * 以及 is_local=true 在事务结束后失效（PgBouncer 连接复用安全）。
 *
 * 关键：RLS 仅对非超级用户且无 BYPASSRLS 的角色生效。testcontainers 默认 postgres 是超级用户会绕过
 * RLS，因此本测试用 007 迁移创建的 backtest_app 角色（NOBYPASSRLS）建立独立连接池，并 mock
 * pool.ts 的 getPool 返回该池，使 withTenant 在 RLS 受约束的连接上执行。
 *
 * 运行前置：本地需有 Docker 守护进程（testcontainers 自动拉起 postgres:16-alpine）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ===== Mocks =====
// tenant.ts 依赖 logger（仅错误日志）与 pool.ts 的 getPool。
// 沉默 logger；将 getPool 替换为受控的 backtest_app 连接池（RLS 受约束）。
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
}));

const poolHolder = vi.hoisted(() => ({ pool: null as pg.Pool | null }));

vi.mock('../../../packages/backend/src/db/pool.js', async () => {
  // tenant.ts 现 re-export withTenant from pool.ts（Task C26 去重）。
  // 不能用 importOriginal — 真实 withTenant 闭包捕获真实 getPool，会绕过 mock
  // 连到 config.DATABASE_URL 默认库。这里内联与 pool.ts 等价的实现，
  // 调用本 mock 内的 getPool（返回受控 testcontainers 连接池）。
  const { isUuid } = await import('../../../packages/backend/src/utils/validation.js');
  const { logger } = await import('../../../packages/backend/src/utils/logger.js');
  return {
    getPool: () => {
      if (!poolHolder.pool) throw new Error('测试连接池未初始化');
      return poolHolder.pool;
    },
    withTenant: async (tenantId: string, fn: (client: pg.PoolClient) => Promise<unknown>) => {
      if (!isUuid(tenantId)) {
        throw new Error(`withTenant: 非法 tenantId（需为 UUID）: ${tenantId}`);
      }
      const pool = poolHolder.pool;
      if (!pool) throw new Error('测试连接池未初始化');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackErr) {
          logger.error({ err: rollbackErr }, '[db] withTenant ROLLBACK 失败');
        }
        throw err;
      } finally {
        client.release();
      }
    },
  };
});

// Docker + testcontainers 可用性检查：
// 默认 skip（避免本地 Docker Desktop 故障导致 hook 超时），仅在 CI 或显式设置
// RUN_TESTCONTAINERS=1 时运行。检测 docker info + 容器实际启动能力。
let dockerAvailable = process.env.RUN_TESTCONTAINERS === '1';
if (dockerAvailable) {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
  } catch {
    dockerAvailable = false;
  }
}

const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations');

function readMigration(name: string): string {
  return readFileSync(resolve(MIGRATIONS_DIR, name), 'utf-8');
}

// 009 迁移依赖：001（schema_migrations/tickers）、004（users 外键）、005（outbox，009 ALTER）、
// 007（backtest_app 角色）、008（checks）。按版本顺序执行。
const MIGRATION_FILES = [
  '001_init.sql',
  '002_fts.sql',
  '003_index_cleanup.sql',
  '004_users.sql',
  '005_outbox.sql',
  '006_outbox_dedup.sql',
  '007_least_privilege.sql',
  '008_checks.sql',
  '009_tenancy.sql',
];

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

describe.skipIf(!dockerAvailable)('withTenant RLS 强制点（testcontainers PG, ADR-032）', () => {
  let container: StartedPostgreSqlContainer;
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('backtest_test')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();

    const adminUri = container.getConnectionUri();
    adminPool = new pg.Pool({ connectionString: adminUri });

    // 以超级用户执行迁移：建表 + RLS 策略 + backtest_app 角色（NOBYPASSRLS）
    for (const file of MIGRATION_FILES) {
      await adminPool.query(readMigration(file));
    }

    // backtest_app 连接池：非超级用户，RLS 策略生效
    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const dbName = container.getDatabase();
    appPool = new pg.Pool({
      connectionString: `postgresql://backtest_app:change-me-in-deploy@${host}:${port}/${dbName}`,
    });
    poolHolder.pool = appPool;

    // 测试夹具：两个租户 + 租户 A 的一个组合（超级用户绕过 RLS 直接插入）
    await adminPool.query(
      `INSERT INTO organizations (id, name, slug) VALUES
        ($1, 'Org A', 'org-a'),
        ($2, 'Org B', 'org-b')`,
      [ORG_A, ORG_B],
    );
    await adminPool.query(
      `INSERT INTO portfolios (tenant_id, name, assets, rebalance_frequency) VALUES
        ($1, 'Portfolio A', '[{"ticker":"SPY","weight":100}]'::jsonb, 'none')`,
      [ORG_A],
    );
  }, 120000);

  afterAll(async () => {
    if (appPool) await appPool.end();
    if (adminPool) await adminPool.end();
    if (container) await container.stop();
  });

  it('27.1 应能读取当前租户的数据（set_config 生效）', async () => {
    const { withTenant } = await import('../../../packages/backend/src/db/tenant.js');
    const rows = await withTenant(ORG_A, async (client) => {
      const result = await client.query('SELECT name FROM portfolios');
      return result.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Portfolio A');
  });

  it('27.1 跨租户读取应返回零行（RLS USING 策略生效）', async () => {
    const { withTenant } = await import('../../../packages/backend/src/db/tenant.js');
    const rows = await withTenant(ORG_B, async (client) => {
      const result = await client.query('SELECT name FROM portfolios');
      return result.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('27.1 跨租户写入应被拒绝（RLS WITH CHECK 策略生效，事务回滚）', async () => {
    const { withTenant } = await import('../../../packages/backend/src/db/tenant.js');
    await expect(
      withTenant(ORG_A, async (client) => {
        // 以租户 A 上下文尝试写入 tenant_id=租户 B 的记录，WITH CHECK 应拒绝
        await client.query(
          `INSERT INTO portfolios (tenant_id, name, assets, rebalance_frequency)
           VALUES ($1, 'Stolen', '[]'::jsonb, 'none')`,
          [ORG_B],
        );
      }),
    ).rejects.toThrow();

    // 验证事务已回滚：租户 B 仍无数据
    const rows = await withTenant(ORG_B, async (client) => {
      const result = await client.query('SELECT name FROM portfolios');
      return result.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('27.2 is_local=true 在事务结束后失效（PgBouncer 连接复用安全）', async () => {
    const { withTenant } = await import('../../../packages/backend/src/db/tenant.js');
    // 在租户上下文内执行一次（设置 app.current_tenant_id）
    await withTenant(ORG_A, async (client) => {
      await client.query('SELECT 1');
    });

    // 事务结束后，同一连接池的新查询应无 app.current_tenant_id（is_local 随 COMMIT 失效）
    const setting = await appPool.query(
      "SELECT current_setting('app.current_tenant_id', true) AS val",
    );
    const val = setting.rows[0].val;
    // missing_ok=true 未设置时返回空字符串
    expect(val === '' || val === null).toBe(true);

    // 无租户上下文时 RLS fail-safe：读到零行（拒绝优于泄露）
    // current_setting 可能返回 ''，''::uuid 会抛 syntax error；
    // 用不存在的有效 UUID 验证非匹配租户读到零行（fail-safe）
    const noTenantCnt = await withTenant('00000000-0000-0000-0000-000000000000', async (client) => {
      const result = await client.query('SELECT count(*)::int AS cnt FROM portfolios');
      return result.rows[0].cnt as number;
    });
    expect(noTenantCnt).toBe(0);
  });

  it('27.1 非法 tenantId 应在连接前拒绝（UUID 校验）', async () => {
    const { withTenant } = await import('../../../packages/backend/src/db/tenant.js');
    await expect(withTenant('not-a-uuid', async () => 'ok')).rejects.toThrow(/非法 tenantId/);
  });
});
