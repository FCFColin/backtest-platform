// scripts/verify/verify-backend.mjs
// C-002 (RLS) + C-018 (singleflight) + C-020 (engine timeout) + C-021 (BullMQ DLQ) + C-022 (OpenAPI) + C-023 (degraded) + C-001 (migrations) + C-015 (ADR) + C-016 (CHANGELOG) + C-017 (migration chain)
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  withDb,
  loadPg,
  runCmd,
  fileExists,
  readFileContent,
  grepInCode,
  runCheck,
  finishVerify,
  PROJECT_ROOT_PATH,
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

await runCheck(results, 'C-018', () => {
  // 原单飞(singleflight)已随同步路径退役，改为 BullMQ 队列（ADR-045）+ 结果缓存
  const hasQueue =
    grepInCode(/submitQueueJob\(|createBacktestWorker\(/, 'packages/backend/src', {
      extensions: ['.ts'],
    }).length > 0;
  const hasCache =
    grepInCode(/getBacktestResultCache|setBacktestResultCache/, 'packages/backend/src', {
      extensions: ['.ts'],
    }).length > 0;
  const hasConcurrency =
    grepInCode(/WORKER_CONCURRENCY/, 'packages/backend/src', {
      extensions: ['.ts'],
    }).length > 0;
  const ok = hasQueue && hasCache && hasConcurrency;
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: ok
      ? 'backtest 队列 + 结果缓存 + 并发控制齐备'
      : `queue=${hasQueue}, cache=${hasCache}, concurrency=${hasConcurrency}`,
  };
});

// ── C-020: engine timeout 验证 ────────────────────────────────
await runCheck(results, 'C-020', () => {
  const f = 'packages/backend/src/config/env.ts';
  if (!fileExists(f)) return { status: 'FAIL', summary: `${f} 不存在` };
  const content = readFileContent(f);
  let timeoutMs = null;
  for (const re of [
    /ENGINE_TIMEOUT_MS\s*[=:]\s*(\d+)/,
    /ENGINE_TIMEOUT_MS\s*:\s*parseInt\([^)]*?\|\|\s*['"](\d+)['"]/,
    /ENGINE_TIMEOUT_MS\s*[=:]\s*\w+\([^)]*['"](\d+)['"]\)/,
    /ENGINE_TIMEOUT_MS\s*[=:]\s*[^;]*?\|\|\s*['"](\d+)['"]/,
  ]) {
    const m = content.match(re);
    if (m) {
      timeoutMs = parseInt(m[1], 10);
      break;
    }
  }
  if (timeoutMs === null) return { status: 'FAIL', summary: `${f} 中未找到 ENGINE_TIMEOUT_MS` };
  const ok = timeoutMs >= 120000;
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: `ENGINE_TIMEOUT_MS = ${timeoutMs}ms (${ok ? '>=' : '<'} 120000ms)`,
    details: { timeoutMs },
  };
});

// ── C-021: BullMQ DLQ 验证 ───────────────────────────────────
await runCheck(results, 'C-021', () => {
  if (!existsSync(join(PROJECT_ROOT_PATH, 'packages/backend/src/queues')))
    return { status: 'FAIL', summary: 'queues 目录不存在' };
  const matches = grepInCode(
    /deadLetterQueue|dlq|DeadLetterQueue/i,
    'packages/backend/src/queues',
    { extensions: ['.ts'] },
  );
  const ok = matches.length >= 1;
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: ok ? `BullMQ DLQ 已配置 (${matches.length} 处)` : '未找到 DLQ 配置',
  };
});

await runCheck(results, 'C-022', () => {
  const f = 'packages/backend/src/schemas/openapi-paths.ts';
  if (!fileExists(f)) return { status: 'FAIL', summary: `${f} 不存在` };
  const urls = [...new Set(readFileContent(f).match(/localhost:\d+/g) ?? [])];
  const hasOld = urls.includes('localhost:5001');
  const hasNew = urls.includes('localhost:15001');
  return {
    status: !hasOld && hasNew ? 'PASS' : 'FAIL',
    summary:
      !hasOld && hasNew ? 'OpenAPI server.url 为 http://localhost:15001' : `OpenAPI URL 未修复`,
  };
});

// ── C-023: ADR-031 degraded 字段验证 ──────────────────────────
// engine/compute 端点 fail-closed 503 无 degraded（ADR-031）；degraded 仅限数据端点(Go data-fetcher 降级)
await runCheck(results, 'C-023', () => {
  const computeRefs = grepInCode(/degraded/, 'packages/backend/src/routes', {
    extensions: ['.ts'],
  }).filter((m) => !m.file.includes('dataRoutes') && !m.file.includes('routeUtils'));
  const pass = computeRefs.length === 0;
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: pass
      ? 'compute 路由无 degraded 字段 (ADR-031)'
      : `${computeRefs.length} 处 compute 路由 degraded 引用: ${computeRefs
          .map((r) => `${r.file}:${r.line}`)
          .join(', ')}`,
    details: { matches: computeRefs.slice(0, 10) },
  };
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

await runCheck(results, 'C-015', () => {
  if (!fileExists('docs/adr/README.md'))
    return { status: 'FAIL', summary: 'docs/adr/README.md 不存在' };
  const readme = readFileContent('docs/adr/README.md');
  const sections = readme.split(/^## /m);
  const activeAdrs = new Set(
    (sections.find((s) => s.startsWith('当前有效')) ?? '').match(/ADR-\d+/g) ?? [],
  );
  const deletedAdrs = new Set(
    (sections.find((s) => s.startsWith('已删除')) ?? '').match(/ADR-\d+/g) ?? [],
  );
  let files = [];
  try {
    files = readdirSync(join(PROJECT_ROOT_PATH, 'docs', 'adr')).filter((f) =>
      /^ADR-\d+.*\.md$/.test(f),
    );
  } catch {}
  const fileAdrs = new Set(files.map((f) => f.match(/^(ADR-\d+)/)?.[1]).filter(Boolean));
  const inIndexNotInFiles = [...activeAdrs].filter((a) => !fileAdrs.has(a));
  const inFilesNotInIndex = [...fileAdrs].filter((a) => !activeAdrs.has(a) && !deletedAdrs.has(a));
  const ok = inIndexNotInFiles.length === 0 && inFilesNotInIndex.length === 0;
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: ok
      ? `ADR 索引与文件一致 (${fileAdrs.size} 文件, ${activeAdrs.size} 有效, ${deletedAdrs.size} 已删除)`
      : `差异: 索引有文件缺失 [${inIndexNotInFiles}], 文件有索引缺失 [${inFilesNotInIndex}]`,
    details: {
      activeCount: activeAdrs.size,
      fileCount: fileAdrs.size,
      inIndexNotInFiles,
      inFilesNotInIndex,
    },
  };
});

await runCheck(results, 'C-016', () => {
  if (!fileExists('CHANGELOG.md')) return { status: 'FAIL', summary: 'CHANGELOG.md 不存在' };
  const changelog = readFileContent('CHANGELOG.md');
  const dates = [...changelog.matchAll(/^## \[[\d.]+\]\s*-\s*(\d{4}-\d{2}-\d{2})/gm)].map(
    (m) => m[1],
  );
  if (dates.length === 0) return { status: 'FAIL', summary: 'CHANGELOG.md 中未找到日期条目' };
  const latestDate = dates[0];
  const gitDate = runCmd('git log -1 --format=%ai').out.trim().split(' ')[0];
  if (!gitDate) return { status: 'FAIL', summary: '无法获取 git log 最新提交日期' };
  const diffDays = (new Date(gitDate).getTime() - new Date(latestDate).getTime()) / 86400000;
  const ok = diffDays <= 7;
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: ok
      ? `CHANGELOG ${latestDate} 在提交 ${gitDate} 7天内`
      : `CHANGELOG 过期: ${latestDate} vs ${gitDate}, 差${diffDays.toFixed(1)}天`,
  };
});

await runCheck(results, 'C-017', () => {
  const dir = join(process.cwd(), 'migrations');
  let allFiles = [];
  try {
    allFiles = readdirSync(dir).filter((f) => f.endsWith('.sql'));
  } catch (e) {
    return { status: 'FAIL', summary: `无法读取 migrations: ${e.message}` };
  }
  const regPath = 'packages/backend/src/db/migrations.ts';
  const regExists = fileExists(regPath);
  const registered = regExists
    ? regLines(regPath)
        .flatMap((l) => [...l.matchAll(/(?:upFile|downFile):\s*'([^']+)'/g)].map((m) => m[1]))
        .filter(Boolean)
    : [];
  const orphans = allFiles.filter((f) => !registered.includes(f));
  const missingReg = registered.filter((f) => !allFiles.includes(f));
  const pass = regExists && orphans.length === 0 && missingReg.length === 0;
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: `orphans=${orphans.length}, missing_reg=${missingReg.length}, registered=${registered.length}`,
    details: { orphans, missingReg },
  };
});

finishVerify('verify-backend', results);
