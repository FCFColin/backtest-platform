// scripts/verify/verify-backend.mjs
// DB 类 CRITICAL 修复验证（需 DATABASE_URL；CI 用 --skip-db 跳过，静态检查见 verify-static.mjs）
// C-002 (RLS) + C-001 (migrations)
import {
  readFileContent,
  fileExists,
  grepInCode,
  withDb,
  loadPg,
  runCheck,
  finishVerify,
} from './_lib.mjs';

const pg = loadPg();

const results = {};

// ── C-002: RLS 多租户隔离验证 ────────────────────────────────
const TENANT_TABLES = [
  'portfolios',
  'backtest_runs',
  'saved_configs',
  'api_keys',
  'audit_logs',
  'webhook_endpoints',
  'webhook_deliveries',
  'stripe_customers',
  'subscriptions',
  'custom_tickers',
  'tactical_configs',
  'invitations',
];
const WRONG_GUC = [/app\.tenant_id/, /app\.org_id(?!_)/];

await runCheck(results, 'C-002', async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Env superuser check
    let envDbUser = null;
    if (fileExists('.env')) {
      for (const line of readFileContent('.env').split(/\r?\n/)) {
        const m = line.trim().match(/^DATABASE_URL=postgresql:\/\/([^:]+):/);
        if (m) envDbUser = m[1];
      }
    }
    const envSuper = envDbUser === 'backtest' || envDbUser === 'postgres';

    const roleRes = await client.query(
      `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'backtest_app'`,
    );
    const appOk =
      roleRes.rows.length > 0 &&
      roleRes.rows[0].rolsuper === false &&
      roleRes.rows[0].rolbypassrls === false &&
      roleRes.rows[0].rolcanlogin === true;

    // RLS enabled + forced
    const rlsRes = await client.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
      [TENANT_TABLES],
    );
    const found = rlsRes.rows.map((r) => r.relname);
    const notExist = TENANT_TABLES.filter((t) => !found.includes(t));
    const missingRls = rlsRes.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    const missingForce = rlsRes.rows
      .filter((r) => r.relrowsecurity && !r.relforcerowsecurity)
      .map((r) => r.relname);

    const polRes = await client.query(
      `SELECT tablename, policyname, qual::text, with_check::text FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      [TENANT_TABLES],
    );
    const wrongGucPolicies = polRes.rows.filter((p) =>
      WRONG_GUC.some((pat) => pat.test(`${p.qual || ''} ${p.with_check || ''}`)),
    );

    const appCodeRefs = grepInCode(
      /app\.(tenant_id|org_id|current_org_id|current_tenant_id)/,
      'packages/backend/src',
      {
        extensions: ['.ts', '.js', '.mjs'],
      },
    );
    const wrongAppCode = appCodeRefs.filter(
      (r) =>
        /app\.(tenant_id|org_id)\b/.test(r.text) && !/app\.current_(org_id|tenant_id)/.test(r.text),
    );

    // Cross-tenant test
    let crossTenant = { skipped: 'backtest_app 角色不存在或权限不正确' };
    if (appOk) {
      let appClient;
      try {
        appClient = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
        await appClient.connect();
        let noneErr = null,
          noneCount = null;
        try {
          noneCount = (await appClient.query('SELECT COUNT(*)::int AS n FROM portfolios')).rows[0]
            .n;
        } catch (e) {
          noneErr = e.message;
        }
        try {
          await appClient.query(
            `SET LOCAL app.current_org_id = '00000000-0000-0000-0000-000000000001'`,
          );
          await appClient.query('SELECT COUNT(*)::int AS n FROM portfolios');
        } catch {}
        await appClient.query('RESET app.current_org_id');
        crossTenant = {
          asNone: { count: noneCount, error: noneErr },
          isolationEnforced: noneErr !== null || noneCount === 0,
        };
      } catch (e) {
        crossTenant = { error: `无法以 backtest_app 身份连接: ${e.message}` };
      } finally {
        if (appClient)
          try {
            await appClient.end();
          } catch {}
      }
    }

    const pass =
      !envSuper &&
      appOk &&
      notExist.length === 0 &&
      missingRls.length === 0 &&
      missingForce.length === 0 &&
      wrongGucPolicies.length === 0 &&
      wrongAppCode.length === 0;
    return {
      status: pass ? 'PASS' : 'FAIL',
      summary: `env_super=${envSuper}, app_role_ok=${appOk}, missing_rls=${missingRls.length}, missing_force=${missingForce.length}, wrong_guc_policies=${wrongGucPolicies.length}, wrong_guc_appcode=${wrongAppCode.length}, tables_not_exist=${notExist.length}`,
      details: {
        envDbUser,
        envSuper,
        appOk,
        notExist,
        missingRls,
        missingForce,
        wrongGucPolicies,
        wrongAppCode,
        crossTenant,
      },
    };
  } finally {
    await client.end();
  }
});

const regLines = (p) =>
  readFileContent(p)
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l));
const EXPECTED_VERSIONS = (() => {
  const p = 'packages/backend/src/db/migrations.ts';
  return fileExists(p)
    ? regLines(p)
        .map((l) => l.match(/version:\s*(\d+)/)?.[1])
        .filter(Boolean)
        .map(Number)
    : [];
})();
const EXPECTED_TABLES = [
  'audit_logs',
  'webhook_endpoints',
  'webhook_deliveries',
  'tactical_configs',
  'announcements',
  'custom_tickers',
  'roles',
  'role_permissions',
  'user_roles',
];

await runCheck(results, 'C-001', () =>
  withDb(async (db) => {
    const applied = (
      await db.query('SELECT version FROM schema_migrations ORDER BY version')
    ).rows.map((r) => r.version);
    const appliedSet = new Set(applied);
    const missingVersions = EXPECTED_VERSIONS.filter((v) => !appliedSet.has(v));
    const unexpectedVersions = applied.filter((v) => !EXPECTED_VERSIONS.includes(v));
    const foundTables = (
      await db.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
        [EXPECTED_TABLES],
      )
    ).rows.map((r) => r.tablename);
    const missingTables = EXPECTED_TABLES.filter((t) => !foundTables.includes(t));
    const tsExt = (
      await db.query(`SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb'`)
    ).rows;
    const timescaleOk = tsExt.length > 0;
    let pricesHt = false;
    if (timescaleOk) {
      const ht = await db.query(
        `SELECT hypertable_name FROM timescaledb_information.hypertables WHERE hypertable_schema = 'public' AND hypertable_name = 'prices'`,
      );
      pricesHt = ht.rows.length > 0;
    }
    let annIdType = null;
    if (!missingTables.includes('announcements')) {
      const c = await db.query(
        `SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'id'`,
      );
      annIdType = c.rows[0]?.data_type ?? null;
    }
    const pass =
      missingVersions.length === 0 &&
      unexpectedVersions.length === 0 &&
      missingTables.length === 0 &&
      timescaleOk &&
      pricesHt &&
      annIdType === 'uuid';
    return {
      status: pass ? 'PASS' : 'FAIL',
      summary: `applied=${applied.length}/${EXPECTED_VERSIONS.length}, missing=${missingVersions.length}, unexpected=${unexpectedVersions.length}, missing_tables=${missingTables.length}, timescale=${timescaleOk}, prices_ht=${pricesHt}, ann_id=${annIdType}`,
      details: {
        applied,
        missingVersions,
        unexpectedVersions,
        missingTables,
        timescaleOk,
        pricesHt,
        annIdType,
      },
    };
  }),
);

finishVerify('verify-backend', results);
