import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createLoggerMocks } from '../../helpers/mockFactories.js';

// tenant.ts 依赖 logger（仅错误日志）与 pool.ts 的 getPool。
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({
  logger: createLoggerMocks(),
}));

const poolHolder = vi.hoisted(() => ({ pool: null as pg.Pool | null }));

// 不能用 importOriginal — 真实 withTenant 闭包捕获真实 getPool，会绕过 mock
// 连到 config.DATABASE_URL 默认库。这里内联与 pool.ts 等价的实现（UUID 校验 + 事务包装），
vi.mock('../../../packages/backend/src/db/pool.js', () => {
  const check = (tenantId: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error(`withTenant: 非法 tenantId（需为 UUID）: ${tenantId}`);
    }
    if (!poolHolder.pool) throw new Error('测试连接池未初始化');
  };
  const run = async (tenantId: string, fn: (client: pg.PoolClient) => Promise<unknown>) => {
    check(tenantId);
    const client = await poolHolder.pool!.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
  return {
    getPool: () => {
      if (!poolHolder.pool) throw new Error('测试连接池未初始化');
      return poolHolder.pool;
    },
    withTenant: run,
    withTenantReadOnly: run,
  };
});

// Docker + testcontainers 可用性检查：
// 默认 skip（避免本地 Docker Desktop 故障导致 hook 超时），仅在 CI 或显式设置
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

const MIGRATION_FILES = ['001_initial_schema.sql'];

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';

describe.skipIf(!dockerAvailable)('withTenant RLS 强制点（testcontainers PG, ADR-032）', () => {
  let container: StartedPostgreSqlContainer;
  let adminPool: pg.Pool;
  let appPool: pg.Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('timescale/timescaledb:latest-pg16')
      .withDatabase('backtest_test')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();

    const adminUri = container.getConnectionUri();
    adminPool = new pg.Pool({ connectionString: adminUri });

    for (const file of MIGRATION_FILES) {
      await adminPool.query(readMigration(file));
    }

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const dbName = container.getDatabase();
    appPool = new pg.Pool({
      connectionString: `postgresql://backtest_app:change-me-in-deploy@${host}:${port}/${dbName}`,
    });
    poolHolder.pool = appPool;

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
    const { withTenant } = await import('../../../packages/backend/src/db/pool.js');
    const rows = await withTenant(ORG_A, async (client) => {
      const result = await client.query('SELECT name FROM portfolios');
      return result.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Portfolio A');
  });

  it('27.1 跨租户读取应返回零行（RLS USING 策略生效）', async () => {
    const { withTenant } = await import('../../../packages/backend/src/db/pool.js');
    const rows = await withTenant(ORG_B, async (client) => {
      const result = await client.query('SELECT name FROM portfolios');
      return result.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('27.1 跨租户写入应被拒绝（RLS WITH CHECK 策略生效，事务回滚）', async () => {
    const { withTenant } = await import('../../../packages/backend/src/db/pool.js');
    await expect(
      withTenant(ORG_A, async (client) => {
        await client.query(
          `INSERT INTO portfolios (tenant_id, name, assets, rebalance_frequency)
           VALUES ($1, 'Stolen', '[]'::jsonb, 'none')`,
          [ORG_B],
        );
      }),
    ).rejects.toThrow();

    const rows = await withTenant(ORG_B, async (client) => {
      const result = await client.query('SELECT name FROM portfolios');
      return result.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('27.2 is_local=true 在事务结束后失效（PgBouncer 连接复用安全）', async () => {
    const { withTenant } = await import('../../../packages/backend/src/db/pool.js');
    await withTenant(ORG_A, async (client) => {
      await client.query('SELECT 1');
    });

    const setting = await appPool.query(
      "SELECT current_setting('app.current_tenant_id', true) AS val",
    );
    const val = setting.rows[0].val;
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
    const { withTenant } = await import('../../../packages/backend/src/db/pool.js');
    await expect(withTenant('not-a-uuid', async () => 'ok')).rejects.toThrow(/非法 tenantId/);
  });
});
