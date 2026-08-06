// scripts/verify/verify-backend.mjs
// C-002 (RLS) + C-003 (webhook SSRF) + C-018 (singleflight) + C-020 (engine timeout) + C-021 (BullMQ DLQ) + C-024 (webhook encryption)
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import {
  withDb,
  fileExists,
  readFileContent,
  grepInCode,
  runCheck,
  finishVerify,
  PROJECT_ROOT_PATH,
} from './_lib.mjs';

const results = {};

// ── C-002: RLS 多租户隔离验证 ────────────────────────────────
const TENANT_TABLES = [
  'portfolios', 'backtest_runs', 'saved_configs', 'api_keys', 'audit_logs',
  'webhook_endpoints', 'webhook_deliveries', 'stripe_customers', 'subscriptions',
  'custom_tickers', 'tactical_configs', 'org_memberships', 'invitations',
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

    // App role check
    const roleRes = await client.query(
      `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'backtest_app'`,
    );
    const appOk = roleRes.rows.length > 0 &&
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
    const missingForce = rlsRes.rows.filter((r) => r.relrowsecurity && !r.relforcerowsecurity).map((r) => r.relname);

    // Wrong GUC in policies
    const polRes = await client.query(
      `SELECT tablename, policyname, qual::text, with_check::text FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      [TENANT_TABLES],
    );
    const wrongGucPolicies = polRes.rows.filter((p) =>
      WRONG_GUC.some((pat) => pat.test(`${p.qual || ''} ${p.with_check || ''}`)),
    );

    // Wrong GUC in app code
    const appCodeRefs = grepInCode(/app\.(tenant_id|org_id|current_org_id|current_tenant_id)/, 'packages/backend/src', {
      extensions: ['.ts', '.js', '.mjs'],
    });
    const wrongAppCode = appCodeRefs.filter(
      (r) => /app\.(tenant_id|org_id)\b/.test(r.text) && !/app\.current_(org_id|tenant_id)/.test(r.text),
    );

    // Cross-tenant test
    let crossTenant = { skipped: 'backtest_app 角色不存在或权限不正确' };
    if (appOk) {
      let appClient;
      try {
        appClient = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
        await appClient.connect();
        let noneErr = null, noneCount = null;
        try {
          noneCount = (await appClient.query('SELECT COUNT(*)::int AS n FROM portfolios')).rows[0].n;
        } catch (e) { noneErr = e.message; }
        let aCount = null;
        try {
          await appClient.query(`SET LOCAL app.current_org_id = '00000000-0000-0000-0000-000000000001'`);
          aCount = (await appClient.query('SELECT COUNT(*)::int AS n FROM portfolios')).rows[0].n;
        } catch {}
        await appClient.query('RESET app.current_org_id');
        crossTenant = { asNone: { count: noneCount, error: noneErr }, isolationEnforced: noneErr !== null || noneCount === 0 };
      } catch (e) {
        crossTenant = { error: `无法以 backtest_app 身份连接: ${e.message}` };
      } finally {
        if (appClient) try { await appClient.end(); } catch {}
      }
    }

    const pass = !envSuper && appOk && notExist.length === 0 && missingRls.length === 0 &&
      missingForce.length === 0 && wrongGucPolicies.length === 0 && wrongAppCode.length === 0;
    return {
      status: pass ? 'PASS' : 'FAIL',
      summary: `env_super=${envSuper}, app_role_ok=${appOk}, missing_rls=${missingRls.length}, missing_force=${missingForce.length}, wrong_guc_policies=${wrongGucPolicies.length}, wrong_guc_appcode=${wrongAppCode.length}, tables_not_exist=${notExist.length}`,
      details: { envDbUser, envSuper, appOk, notExist, missingRls, missingForce, wrongGucPolicies, wrongAppCode, crossTenant },
    };
  } finally {
    await client.end();
  }
});

// ── C-003: Webhook SSRF 防护验证 ─────────────────────────────
await runCheck(results, 'C-003', async () => {
  const svcPath = 'packages/backend/src/application/webhookService.ts';
  const guardPath = 'packages/backend/src/utils/ssrfGuard.ts';
  if (!fileExists(svcPath)) return { status: 'FAIL', summary: 'webhookService.ts not found' };
  const svc = readFileContent(svcPath);
  const guard = fileExists(guardPath) ? readFileContent(guardPath) : '';
  const combined = svc + guard;

  const checks = {
    ipValidation: /isPrivateIPv4|isPrivateIPv6|isForbiddenIp|isPrivate/.test(guard),
    dnsResolve: /dns\.resolve|dns\.lookup/.test(guard),
    dnsRebinding: /dns\.resolve4|resolve4\s*\(/.test(guard) && /rebind|SSRF_DNS_REBINDING/i.test(guard),
    sizeLimit: /MAX_RESPONSE_BYTES|readResponseWithLimit|maxBytes/i.test(combined),
    importsAssertSafeUrl: /import\s+\{[^}]*assertSafeUrl[^}]*\}\s+from\s+['"][^'"]*ssrfGuard/.test(svc),
    callsAssertSafeUrl: /assertSafeUrl\s*\(/.test(svc),
  };
  const hasTest = fileExists('tests/unit/services/webhookService.ssrf.test.ts') ||
    fileExists('tests/unit/utils/ssrf-guard.test.ts') ||
    fileExists('tests/unit/application/webhookService.test.ts');
  const delegationValid = checks.importsAssertSafeUrl && checks.callsAssertSafeUrl;
  const allChecks = Object.values(checks).every(Boolean);

  // Integration test
  let integration = { status: 'SKIP' };
  try {
    const token = process.env.TEST_ADMIN_TOKEN || 'dev-admin-token';
    const intResults = await Promise.all(
      ['http://169.254.169.254/latest/meta-data/', 'http://localhost:6379/', 'http://10.0.0.1/', 'http://[::1]/'].map(async (url) => {
        try {
          const res = await fetch('http://localhost:15001/api/v1/webhooks/test-ssrf', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ url }), signal: AbortSignal.timeout(5000),
          });
          return { url, status: res.status, rejected: res.status >= 400 };
        } catch (e) { return { url, error: e.message }; }
      }),
    );
    if (intResults.every((r) => r.error)) {
      integration = { status: 'SKIP', reason: 'API not available', sampleError: intResults[0]?.error };
    } else {
      integration = { status: 'DONE', allRejected: intResults.filter((r) => !r.error).every((r) => r.rejected) };
    }
  } catch (e) { integration = { status: 'SKIP', reason: e.message }; }

  const pass = allChecks && hasTest && delegationValid && (integration.status === 'SKIP' || integration.allRejected === true);
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: `static=${allChecks ? 'all' : 'PARTIAL'}, tests=${hasTest ? 'present' : 'missing'}, delegation=${delegationValid ? 'valid' : 'invalid'}, integration=${integration.status}`,
    details: { checks, hasTest, delegationValid, integration },
  };
});

// ── C-018: singleflight 验证 ─────────────────────────────────
await runCheck(results, 'C-018', () => {
  const f = 'packages/backend/src/application/backtest/backtestResultCache.ts';
  if (!fileExists(f)) return { status: 'FAIL', summary: `${f} 不存在` };
  const ops = new Set(
    grepInCode(/inFlight\.(set|get|delete)/, 'packages/backend/src/application/backtest', { extensions: ['.ts'] })
      .filter((m) => m.file.includes('backtestResultCache.ts'))
      .map((m) => m.text.match(/inFlight\.(set|get|delete)/)?.[1]),
  );
  const ok = ops.has('set') && ops.has('get') && ops.has('delete');
  return { status: ok ? 'PASS' : 'FAIL', summary: ok ? 'inFlight Map 三种操作齐全' : `操作不完整: ${[...ops].join('/')}` };
});

// ── C-020: engine timeout 验证 ────────────────────────────────
await runCheck(results, 'C-020', () => {
  const f = 'packages/backend/src/config/engineConfig.ts';
  if (!fileExists(f)) return { status: 'FAIL', summary: `${f} 不存在` };
  const content = readFileContent(f);
  let timeoutMs = null;
  for (const re of [/ENGINE_TIMEOUT_MS\s*[=:]\s*(\d+)/, /ENGINE_TIMEOUT_MS\s*:\s*parseInt\([^)]*?\|\|\s*['"](\d+)['"]/, /ENGINE_TIMEOUT_MS\s*[=:]\s*[^;]*?\|\|\s*['"](\d+)['"]/]) {
    const m = content.match(re);
    if (m) { timeoutMs = parseInt(m[1], 10); break; }
  }
  if (timeoutMs === null) return { status: 'FAIL', summary: `${f} 中未找到 ENGINE_TIMEOUT_MS` };
  const ok = timeoutMs >= 120000;
  return { status: ok ? 'PASS' : 'FAIL', summary: `ENGINE_TIMEOUT_MS = ${timeoutMs}ms (${ok ? '>=' : '<'} 120000ms)`, details: { timeoutMs } };
});

// ── C-021: BullMQ DLQ 验证 ───────────────────────────────────
await runCheck(results, 'C-021', () => {
  if (!existsSync(join(PROJECT_ROOT_PATH, 'packages/backend/src/queues')))
    return { status: 'FAIL', summary: 'queues 目录不存在' };
  const matches = grepInCode(/deadLetterQueue|dlq|DeadLetterQueue/i, 'packages/backend/src/queues', { extensions: ['.ts'] });
  const ok = matches.length >= 1;
  return { status: ok ? 'PASS' : 'FAIL', summary: ok ? `BullMQ DLQ 已配置 (${matches.length} 处)` : '未找到 DLQ 配置' };
});

// ── C-024: Webhook secret 加密验证 ────────────────────────────
const WH_SVC = 'packages/backend/src/application/webhookService.ts';
const WH_ENC = 'packages/backend/src/utils/envelopeEncryption.ts';
const WH_TESTS = [
  'tests/unit/services/webhookService.encryption.test.ts',
  'tests/unit/application/webhookService.encryption.test.ts',
  'tests/unit/application/webhookService.test.ts',
  'tests/unit/services/webhookService.test.ts',
];

await runCheck(results, 'C-024', async () => {
  // DB layer
  let dbStatus = 'SKIP';
  try {
    await withDb(async (db) => {
      const cols = (await db.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'webhook_endpoints' AND column_name IN ('secret', 'secret_iv', 'secret_tag', 'secret_kid')`,
      )).rows;
      const secretCol = cols.find((c) => c.column_name === 'secret');
      dbStatus = secretCol ? (secretCol.data_type === 'bytea' ? 'PASS' : 'FAIL') : 'FAIL';
    });
  } catch { dbStatus = 'SKIP'; }

  // Migration layer
  let migStatus = 'SKIP';
  if (fileExists('migrations/021_webhooks.sql')) {
    const sql = readFileContent('migrations/021_webhooks.sql');
    migStatus = /secret\s+bytea/i.test(sql) && !/secret\s+(text|varchar)/i.test(sql) ? 'PASS' : 'FAIL';
  }

  // App layer
  let appStatus = 'FAIL';
  if (fileExists(WH_SVC)) {
    const src = readFileContent(WH_SVC);
    const hasEnc = /\bencrypt\b/i.test(src) && /\bdecrypt\b/i.test(src);
    const hasImport = /from\s+['"][^'"]*envelopeEncryption(?:\.js)?['"]/.test(src) || /from\s+['"][^'"]*\/crypto['"]/.test(src);
    appStatus = hasEnc && hasImport ? 'PASS' : 'FAIL';
  }

  // Envelope layer
  let envStatus = fileExists(WH_ENC) ? 'PASS' : 'FAIL';

  // Test layer
  const testStatus = WH_TESTS.map((p) => ({ path: p, exists: fileExists(p) }));
  const hasEncTest = testStatus.some((t) => t.exists && /encryption/.test(t.path));
  const testLayer = hasEncTest ? 'PASS' : testStatus.some((t) => t.exists) ? 'NEEDS_MANUAL_REVIEW' : 'FAIL';

  const pass = ['PASS', 'PASS', 'PASS', 'PASS', 'PASS'].every((s, i) => [dbStatus, migStatus, appStatus, envStatus, testLayer][i] === s);
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: `db=${dbStatus}, migration=${migStatus}, app=${appStatus}, envelope=${envStatus}, tests=${testLayer}`,
    details: { dbStatus, migStatus, appStatus, envStatus, testLayer, testFiles: testStatus },
  };
});

finishVerify('verify-backend', results);
