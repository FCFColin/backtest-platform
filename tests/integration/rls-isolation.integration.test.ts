import '../helpers/loggerMock.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  isDockerAvailable,
  setupTestContainer,
  type TestContainerContext,
} from '../helpers/testcontainersPg.js';
import { getPool, withTenant, withTenantReadOnly } from '../../packages/backend/src/db/pool.js';

const dockerAvailable = isDockerAvailable();

describe.skipIf(!dockerAvailable)('RLS 跨租户隔离集成测试（P0-03）', () => {
  let ctx: TestContainerContext;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    ctx = await setupTestContainer();

    const pool = getPool();
    const orgAResult = await pool.query(
      "INSERT INTO organizations (name, slug) VALUES ('Org A', 'org-a-' || gen_random_uuid()) RETURNING id",
    );
    const orgBResult = await pool.query(
      "INSERT INTO organizations (name, slug) VALUES ('Org B', 'org-b-' || gen_random_uuid()) RETURNING id",
    );
    orgA = orgAResult.rows[0].id;
    orgB = orgBResult.rows[0].id;
  }, 300000);

  afterAll(async () => {
    await ctx.cleanup();
  });

  it('Org A 的 portfolio 对 Org B 不可见（withTenantReadOnly）', async () => {
    const created = await withTenant(orgA, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO portfolios (tenant_id, name, assets, rebalance_frequency)
         VALUES ($1, 'Org A Portfolio', '[{"ticker":"VTI","weight":100}]'::jsonb, 'none')
         RETURNING id`,
        [orgA],
      );
      return rows[0].id;
    });

    const orgBResults = await withTenantReadOnly(orgB, async (client) => {
      const { rows } = await client.query('SELECT id FROM portfolios');
      return rows;
    });
    expect(orgBResults).toHaveLength(0);

    const orgAResults = await withTenantReadOnly(orgA, async (client) => {
      const { rows } = await client.query('SELECT id FROM portfolios');
      return rows;
    });
    expect(orgAResults).toHaveLength(1);
    expect(orgAResults[0].id).toBe(created);
  });

  it('Org A 的 backtest_run 对 Org B 不可见（withTenantReadOnly）', async () => {
    const created = await withTenant(orgA, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO backtest_runs (tenant_id, name, request, result, status)
         VALUES ($1, 'Org A Run', '{}'::jsonb, '{"sharpe":1.5}'::jsonb, 'completed')
         RETURNING id`,
        [orgA],
      );
      return rows[0].id;
    });

    const orgBResults = await withTenantReadOnly(orgB, async (client) => {
      const { rows } = await client.query('SELECT id FROM backtest_runs');
      return rows;
    });
    expect(orgBResults).toHaveLength(0);

    const orgBById = await withTenantReadOnly(orgB, async (client) => {
      const { rows } = await client.query('SELECT id FROM backtest_runs WHERE id = $1', [created]);
      return rows;
    });
    expect(orgBById).toHaveLength(0);

    const orgAResults = await withTenantReadOnly(orgA, async (client) => {
      const { rows } = await client.query('SELECT id FROM backtest_runs');
      return rows;
    });
    expect(orgAResults).toHaveLength(1);
    expect(orgAResults[0].id).toBe(created);
  });

  it('Org A 的 saved_config 对 Org B 不可见（withTenantReadOnly）', async () => {
    const created = await withTenant(orgA, async (client) => {
      const { rows } = await client.query(
        `INSERT INTO saved_configs (tenant_id, name, config)
         VALUES ($1, 'Org A Config', '{"test":true}'::jsonb)
         RETURNING id`,
        [orgA],
      );
      return rows[0].id;
    });

    const orgBResults = await withTenantReadOnly(orgB, async (client) => {
      const { rows } = await client.query('SELECT id FROM saved_configs');
      return rows;
    });
    expect(orgBResults).toHaveLength(0);

    const orgAResults = await withTenantReadOnly(orgA, async (client) => {
      const { rows } = await client.query('SELECT id FROM saved_configs');
      return rows;
    });
    expect(orgAResults).toHaveLength(1);
    expect(orgAResults[0].id).toBe(created);
  });

  it('EXPLAIN 输出包含 RLS 租户限定（tenant_isolation 策略生效）', async () => {
    const explainResult = await withTenantReadOnly(orgA, async (client) => {
      const { rows } = await client.query('EXPLAIN (FORMAT TEXT) SELECT * FROM portfolios');
      return rows.map((r: { 'QUERY PLAN': string }) => r['QUERY PLAN']).join('\n');
    });

    // RLS 限定会作为 Filter 或 Index Cond 下推，两种形态都须引用 current_setting 与 tenant_id
    expect(explainResult.toLowerCase()).toContain('current_setting');
    expect(explainResult.toLowerCase()).toContain('tenant_id');
  });

  it('未设置租户上下文时查询返回零行（fail-safe，拒绝优于泄露）', async () => {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const { rows } = await client.query('SELECT id FROM portfolios');
      expect(rows).toHaveLength(0);

      const { rows: runRows } = await client.query('SELECT id FROM backtest_runs');
      expect(runRows).toHaveLength(0);

      const { rows: configRows } = await client.query('SELECT id FROM saved_configs');
      expect(configRows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it('Org B 上下文不能插入 Org A tenant_id 的数据（WITH CHECK 策略拒绝）', async () => {
    await expect(
      withTenant(orgB, async (client) => {
        await client.query(
          `INSERT INTO portfolios (tenant_id, name, assets, rebalance_frequency)
           VALUES ($1, 'Cross-tenant Attack', '[{"ticker":"VTI","weight":100}]'::jsonb, 'none')`,
          [orgA],
        );
      }),
    ).rejects.toThrow();
  });

  it('事务结束后租户 GUC 失效（SET LOCAL 语义，PgBouncer 连接复用安全）', async () => {
    await withTenant(orgA, async (client) => {
      await client.query('SELECT 1');
    });

    const pool = getPool();
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        "SELECT current_setting('app.current_tenant_id', true) AS val",
      );
      expect(rows[0].val === '' || rows[0].val === null).toBe(true);
    } finally {
      client.release();
    }
  });

  it('非匹配租户 UUID 查询返回零行（fail-safe，拒绝优于泄露）', async () => {
    const rows = await withTenantReadOnly(
      '00000000-0000-0000-0000-000000000000',
      async (client) => {
        const { rows } = await client.query('SELECT id FROM portfolios');
        return rows;
      },
    );
    expect(rows).toHaveLength(0);
  });

  it('非法 tenantId 应在连接前拒绝（UUID 校验）', async () => {
    await expect(withTenant('not-a-uuid', async () => 'ok')).rejects.toThrow(/非法 tenantId/);
  });
});
