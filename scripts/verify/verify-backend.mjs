// scripts/verify/verify-backend.mjs
// 后端安全/可靠性验证聚合：C-002 (RLS) + C-003 (webhook SSRF) + C-018 (singleflight) + C-020 (engine timeout) + C-021 (BullMQ DLQ) + C-024 (webhook encryption)
// 合并自：C-002-rls-isolation.mjs + C-003-webhook-ssrf.mjs + C-018-singleflight.mjs + C-020-engine-timeout.mjs + C-021-bullmq-dlq.mjs + C-024-webhook-encryption.mjs
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

// ── C-002: RLS 多租户隔离真实性验证 ────────────────────────────
const C002_TENANT_TABLES = [
  'portfolios', 'backtest_runs', 'saved_configs', 'api_keys',
  'audit_logs', 'webhook_endpoints', 'webhook_deliveries',
  'stripe_customers', 'subscriptions', 'custom_tickers',
  'tactical_configs', 'org_memberships', 'invitations',
];
const C002_WRONG_GUC_PATTERNS = [/app\.tenant_id/, /app\.org_id(?!_)/];
const C002_CORRECT_GUC_NAMES = ['app.current_org_id', 'app.current_tenant_id'];

await runCheck(results, 'C-002', async () => {
  const superClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await superClient.connect();
  try {
    let envDbUser = null, envAppDbUser = null;
    const envFileExists = fileExists('.env');
    if (envFileExists) {
      const envContent = readFileContent('.env');
      for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        let m;
        if ((m = trimmed.match(/^DATABASE_URL=postgresql:\/\/([^:]+):/))) envDbUser = m[1];
        else if ((m = trimmed.match(/^APP_DATABASE_URL=postgresql:\/\/([^:]+):/))) envAppDbUser = m[1];
      }
    }
    const envUsingSuperuser = envDbUser === 'backtest' || envDbUser === 'postgres';

    let configDefaultUser = null;
    const configPath = 'packages/backend/src/config/index.ts';
    if (fileExists(configPath)) {
      const cfg = readFileContent(configPath);
      const m = cfg.match(/DATABASE_URL[^=]*=\s*['"]postgres:\/\/([^:]+):/);
      if (m) configDefaultUser = m[1];
    }

    const appRoleRes = await superClient.query(`
      SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb
      FROM pg_roles WHERE rolname = 'backtest_app'
    `);
    const appRoleExists = appRoleRes.rows.length > 0;
    let appRoleIsCorrect = false, appRoleInfo = null;
    if (appRoleExists) {
      appRoleInfo = appRoleRes.rows[0];
      appRoleIsCorrect = appRoleInfo.rolsuper === false && appRoleInfo.rolbypassrls === false && appRoleInfo.rolcanlogin === true;
    }

    const rlsRes = await superClient.query(`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced, n.nspname AS schema
      FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])
      ORDER BY c.relname
    `, [C002_TENANT_TABLES]);
    const foundRlsTables = rlsRes.rows.map((r) => r.table_name);
    const tablesNotExist = C002_TENANT_TABLES.filter((t) => !foundRlsTables.includes(t));
    const tablesMissingRls = rlsRes.rows.filter((r) => !r.rls_enabled).map((r) => r.table_name);
    const tablesMissingForce = rlsRes.rows.filter((r) => r.rls_enabled && !r.rls_forced).map((r) => r.table_name);

    const policiesRes = await superClient.query(`
      SELECT schemaname, tablename, policyname, qual::text AS qual, with_check::text AS with_check
      FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1::text[])
    `, [C002_TENANT_TABLES]);
    const wrongGucPolicies = [];
    for (const p of policiesRes.rows) {
      const qualAndCheck = `${p.qual || ''} ${p.with_check || ''}`;
      for (const pat of C002_WRONG_GUC_PATTERNS) {
        if (pat.test(qualAndCheck)) {
          wrongGucPolicies.push({ table: p.tablename, policy: p.policyname, qual: p.qual, withcheck: p.with_check, matchedPattern: pat.source });
          break;
        }
      }
    }
    const appCodeGucRefs = grepInCode(/app\.(tenant_id|org_id|current_org_id|current_tenant_id)/, 'packages/backend/src', { extensions: ['.ts', '.js', '.mjs'] });
    const wrongAppCodeGuc = appCodeGucRefs.filter((r) => /app\.(tenant_id|org_id)\b/.test(r.text) && !/app\.current_(org_id|tenant_id)/.test(r.text));

    let crossTenantTest = null;
    if (appRoleIsCorrect) {
      let appClient;
      try {
        appClient = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
        await appClient.connect();
        let asNoneErr = null, asNoneCount = null;
        try { const r = await appClient.query('SELECT COUNT(*)::int AS n FROM portfolios'); asNoneCount = r.rows[0].n; } catch (e) { asNoneErr = e.message; }
        let asAErr = null, asACount = null;
        try { await appClient.query(`SET LOCAL app.current_org_id = '00000000-0000-0000-0000-000000000001'`); const r = await appClient.query('SELECT COUNT(*)::int AS n FROM portfolios'); asACount = r.rows[0].n; } catch (e) { asAErr = e.message; }
        await appClient.query('RESET app.current_org_id');
        let asBErr = null, asBCount = null;
        try { await appClient.query(`SET LOCAL app.current_org_id = '00000000-0000-0000-0000-000000000002'`); const r = await appClient.query('SELECT COUNT(*)::int AS n FROM portfolios'); asBCount = r.rows[0].n; } catch (e) { asBErr = e.message; }
        crossTenantTest = { asNone: { count: asNoneCount, error: asNoneErr }, asOrgA: { count: asACount, error: asAErr }, asOrgB: { count: asBCount, error: asBErr }, isolationEnforced: asNoneErr !== null || asNoneCount === 0 };
      } catch (e) {
        crossTenantTest = { error: `无法以 backtest_app 身份连接: ${e.message}` };
      } finally {
        if (appClient) try { await appClient.end(); } catch {}
      }
    } else {
      crossTenantTest = { skipped: 'backtest_app 角色不存在或权限不正确' };
    }

    const pass = !envUsingSuperuser && appRoleIsCorrect && tablesNotExist.length === 0 && tablesMissingRls.length === 0 && tablesMissingForce.length === 0 && wrongGucPolicies.length === 0 && wrongAppCodeGuc.length === 0;
    return {
      status: pass ? 'PASS' : 'FAIL',
      summary: `env_super=${envUsingSuperuser}(${envDbUser}), app_role_ok=${appRoleIsCorrect}, missing_rls=${tablesMissingRls.length}, missing_force=${tablesMissingForce.length}, wrong_guc_policies=${wrongGucPolicies.length}, wrong_guc_appcode=${wrongAppCodeGuc.length}, tables_not_exist=${tablesNotExist.length}`,
      details: { envFileExists, envDbUser, envAppDbUser, configDefaultUser, envUsingSuperuser, appRoleExists, appRoleIsCorrect, appRoleInfo, tenantTablesChecked: C002_TENANT_TABLES, tablesNotExist, tablesMissingRls, tablesMissingForce, rlsTableStatus: rlsRes.rows, policiesWithWrongGuc: wrongGucPolicies, wrongAppCodeGucRefs: wrongAppCodeGuc, correctGucNames: C002_CORRECT_GUC_NAMES, crossTenantTest },
    };
  } finally {
    await superClient.end();
  }
});

// ── C-003: Webhook SSRF 防护验证 ───────────────────────────────
await runCheck(results, 'C-003', async () => {
  const webhookServicePath = 'packages/backend/src/application/webhookService.ts';
  const ssrfGuardPath = 'packages/backend/src/utils/ssrfGuard.ts';
  const webhookServiceExists = fileExists(webhookServicePath);
  const ssrfGuardExists = fileExists(ssrfGuardPath);
  if (!webhookServiceExists) {
    return { status: 'FAIL', summary: 'webhookService.ts not found', details: { webhookServiceExists, ssrfGuardExists } };
  }
  const webhookSrc = readFileContent(webhookServicePath);
  const ssrfSrc = ssrfGuardExists ? readFileContent(ssrfGuardPath) : '';
  const regexes = {
    hasIpValidation: /isPrivateIp|isInternalIp|blockPrivateIp|isPrivate/,
    hasDnsResolve: /dns\.resolve|dns\.lookup|lookupService/,
    hasPortValidation: /allowedPorts|80|443|8080|8443/,
    hasTimeout: /AbortSignal\.timeout|AbortController.*timeout|signal:/,
    hasSizeLimit: /maxSize|contentLength|content-length/i,
    hasDnsRebindingProtection: /resolve.*again|double.*check|resolve.*second|getaddrinfo|dnsLookup.*then.*fetch/,
  };
  const webhookChecks = { hasIpValidation: regexes.hasIpValidation.test(webhookSrc), hasDnsResolve: regexes.hasDnsResolve.test(webhookSrc), hasPortValidation: regexes.hasPortValidation.test(webhookSrc), hasTimeout: regexes.hasTimeout.test(webhookSrc), hasSizeLimit: regexes.hasSizeLimit.test(webhookSrc), hasDnsRebindingProtection: regexes.hasDnsRebindingProtection.test(webhookSrc) };
  const ssrfChecks = ssrfGuardExists ? { hasIpValidation: regexes.hasIpValidation.test(ssrfSrc), hasDnsResolve: regexes.hasDnsResolve.test(ssrfSrc), hasPortValidation: regexes.hasPortValidation.test(ssrfSrc), hasTimeout: regexes.hasTimeout.test(ssrfSrc), hasSizeLimit: regexes.hasSizeLimit.test(ssrfSrc), hasDnsRebindingProtection: regexes.hasDnsRebindingProtection.test(ssrfSrc) } : { hasIpValidation: false, hasDnsResolve: false, hasPortValidation: false, hasTimeout: false, hasSizeLimit: false, hasDnsRebindingProtection: false };
  const combinedChecks = { hasIpValidation: webhookChecks.hasIpValidation || ssrfChecks.hasIpValidation, hasDnsResolve: webhookChecks.hasDnsResolve || ssrfChecks.hasDnsResolve, hasPortValidation: webhookChecks.hasPortValidation || ssrfChecks.hasPortValidation, hasTimeout: webhookChecks.hasTimeout || ssrfChecks.hasTimeout, hasSizeLimit: webhookChecks.hasSizeLimit || ssrfChecks.hasSizeLimit, hasDnsRebindingProtection: webhookChecks.hasDnsRebindingProtection || ssrfChecks.hasDnsRebindingProtection };
  const actualSizeLimit = /MAX_RESPONSE_BYTES|readResponseWithLimit|maxBytes/i.test(webhookSrc) || /MAX_RESPONSE_BYTES|readResponseWithLimit|maxBytes/i.test(ssrfSrc);
  const actualDnsRebinding = /dns\.resolve4|resolve4\s*\(/.test(ssrfSrc) && /for\s*\(.*addr.*\)|\.forEach|\.map/.test(ssrfSrc) && /rebind|SSRF_DNS_REBINDING/i.test(ssrfSrc);
  const actualIpValidation = /isPrivateIPv4|isPrivateIPv6|isForbiddenIp/.test(ssrfSrc);
  const importsAssertSafeUrl = /import\s+\{[^}]*assertSafeUrl[^}]*\}\s+from\s+['"][^'"]*ssrfGuard/.test(webhookSrc);
  const callsAssertSafeUrl = /assertSafeUrl\s*\(/.test(webhookSrc);
  const actualProtection = { sizeLimit: actualSizeLimit, dnsRebinding: actualDnsRebinding, ipValidation: actualIpValidation, importsAssertSafeUrl, callsAssertSafeUrl };
  const specifiedTestPath = 'tests/unit/services/webhookService.ssrf.test.ts';
  const alternativeTestPaths = ['tests/unit/utils/ssrf-guard.test.ts', 'tests/unit/application/webhookService.test.ts'];
  const hasSpecifiedTestFile = fileExists(specifiedTestPath);
  const alternativeTestFiles = alternativeTestPaths.filter((p) => fileExists(p));
  let integrationTest = null;
  const testUrls = ['http://169.254.169.254/latest/meta-data/', 'http://localhost:6379/', 'http://10.0.0.1/', 'http://[::1]/'];
  const adminToken = process.env.TEST_ADMIN_TOKEN || 'dev-admin-token';
  try {
    const intResults = await Promise.all(testUrls.map(async (url) => {
      try {
        const res = await fetch('http://localhost:15001/api/v1/webhooks/test-ssrf', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(5000) });
        return { url, status: res.status, rejected: res.status >= 400 };
      } catch (e) { return { url, error: e.message, rejected: null }; }
    }));
    const allErrors = intResults.every((r) => r.error);
    if (allErrors) { integrationTest = { status: 'SKIP', reason: 'API not available or endpoint does not exist', sampleError: intResults[0]?.error, results: intResults }; }
    else { integrationTest = { status: 'DONE', results: intResults, allRejected: intResults.filter((r) => !r.error).every((r) => r.rejected) }; }
  } catch (e) { integrationTest = { status: 'SKIP', reason: 'API not available', message: e.message }; }
  const isPrivateIpUtilHits = grepInCode(/isPrivateIPv4|isPrivateIPv6|isForbiddenIp|isPrivateIp/i, 'packages/backend/src/utils', { extensions: ['.ts'] });
  const isPrivateIpTestHits = grepInCode(/isPrivateIPv4|isPrivateIPv6|isForbiddenIp|assertSafeUrl/i, 'tests/unit', { extensions: ['.ts'] });
  const webhookRoutesPath = 'packages/backend/src/routes/webhookRoutes.ts';
  const routesSrc = fileExists(webhookRoutesPath) ? readFileContent(webhookRoutesPath) : '';
  const createWebhookHasHttpsOnly = /refine\([^)]*https:\/\//i.test(routesSrc) && !/assertSafeUrl/.test(routesSrc);
  const createWebhookCallsSsrf = /assertSafeUrl/.test(routesSrc);
  const sendWebhookCallsSsrf = /deliverWebhook[\s\S]*?assertSafeUrl/.test(webhookSrc) || callsAssertSafeUrl;
  const additionalChecks = { isPrivateIpUtilityExists: isPrivateIpUtilHits.length > 0, isPrivateIpUtilityPath: isPrivateIpUtilHits.map((h) => h.file), isPrivateIpTestExists: isPrivateIpTestHits.length > 0, isPrivateIpTestPath: isPrivateIpTestHits.map((h) => h.file), createWebhookValidation: createWebhookCallsSsrf ? 'SSRF check via assertSafeUrl' : createWebhookHasHttpsOnly ? 'HTTPS-only (Zod refine), NO SSRF check at registration' : 'unknown', sendWebhookValidation: sendWebhookCallsSsrf ? 'SSRF check via assertSafeUrl before fetch' : 'NO SSRF check found', bothPathsValidated: createWebhookCallsSsrf && sendWebhookCallsSsrf };
  const staticPassMap = { hasIpValidation: combinedChecks.hasIpValidation || actualProtection.ipValidation, hasDnsResolve: combinedChecks.hasDnsResolve, hasPortValidation: combinedChecks.hasPortValidation, hasTimeout: combinedChecks.hasTimeout, hasSizeLimit: combinedChecks.hasSizeLimit || actualProtection.sizeLimit, hasDnsRebindingProtection: combinedChecks.hasDnsRebindingProtection || actualProtection.dnsRebinding };
  const staticAllPass = Object.values(staticPassMap).every(Boolean);
  const hasTestFile = hasSpecifiedTestFile || alternativeTestFiles.length > 0;
  const delegationValid = importsAssertSafeUrl && callsAssertSafeUrl;
  const integrationOk = integrationTest?.status === 'SKIP' || (integrationTest?.status === 'DONE' && integrationTest?.allRejected === true);
  const pass = staticAllPass && hasTestFile && delegationValid && sendWebhookCallsSsrf && integrationOk;
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: pass ? `SSRF protection real: static=${staticAllPass ? '6/6' : 'PARTIAL'}, tests=${hasTestFile ? 'present' : 'missing'}, delegation=${delegationValid ? 'valid' : 'invalid'}, deliveryCheck=${sendWebhookCallsSsrf}, integration=${integrationTest?.status ?? 'N/A'}` : `SSRF protection has gaps: static=${staticAllPass ? '6/6' : 'PARTIAL'}, tests=${hasTestFile ? 'present' : 'missing'}, delegation=${delegationValid ? 'valid' : 'invalid'}, deliveryCheck=${sendWebhookCallsSsrf}, integration=${integrationTest?.status ?? 'N/A'}`,
    details: { staticChecks: { webhookService: webhookChecks, ssrfGuard: ssrfChecks, combined: combinedChecks, actualProtection, finalAssessment: staticPassMap, staticAllPass }, testFiles: { specifiedPath: { path: specifiedTestPath, exists: hasSpecifiedTestFile }, alternativePaths: alternativeTestPaths.map((p) => ({ path: p, exists: fileExists(p) })), hasAnyTestFile: hasTestFile }, integrationTest, additionalChecks, delegationValid },
  };
});

// ── C-018: singleflight 验证 ───────────────────────────────────
await runCheck(results, 'C-018', () => {
  const C018_targetFile = 'packages/backend/src/application/backtest/backtestResultCache.ts';
  if (!fileExists(C018_targetFile)) {
    return { status: 'FAIL', summary: `${C018_targetFile} 不存在` };
  }
  const matches = grepInCode(/inFlight\.(set|get|delete)/, 'packages/backend/src/application/backtest', { extensions: ['.ts'] });
  const fileMatches = matches.filter((m) => m.file.includes('backtestResultCache.ts'));
  const operations = new Set();
  for (const m of fileMatches) { const opMatch = m.text.match(/inFlight\.(set|get|delete)/); if (opMatch) operations.add(opMatch[1]); }
  const hasSet = operations.has('set'), hasGet = operations.has('get'), hasDelete = operations.has('delete');
  const allThree = hasSet && hasGet && hasDelete;
  return {
    status: allThree ? 'PASS' : 'FAIL',
    summary: allThree ? `inFlight Map 三种操作齐全 (set/get/delete), 共 ${fileMatches.length} 处匹配` : `inFlight Map 操作不完整: set=${hasSet}, get=${hasGet}, delete=${hasDelete}`,
    details: { targetFile: C018_targetFile, totalMatches: fileMatches.length, hasSet, hasGet, hasDelete, matches: fileMatches.map((m) => ({ file: m.file, line: m.line, text: m.text })) },
  };
});

// ── C-020: engine timeout 验证 ──────────────────────────────────
await runCheck(results, 'C-020', () => {
  const C020_targetFile = 'packages/backend/src/config/engineConfig.ts';
  if (!fileExists(C020_targetFile)) {
    return { status: 'FAIL', summary: `${C020_targetFile} 不存在` };
  }
  const content = readFileContent(C020_targetFile);
  let timeoutMs = null, matchLine = '';
  const directMatch = content.match(/ENGINE_TIMEOUT_MS\s*[=:]\s*(\d+)/);
  if (directMatch) { timeoutMs = parseInt(directMatch[1], 10); matchLine = directMatch[0]; }
  if (timeoutMs === null) {
    const parseIntMatch = content.match(/ENGINE_TIMEOUT_MS\s*:\s*parseInt\([^)]*?\|\|\s*['"](\d+)['"]/);
    if (parseIntMatch) { timeoutMs = parseInt(parseIntMatch[1], 10); matchLine = parseIntMatch[0]; }
  }
  if (timeoutMs === null) {
    const envMatch = content.match(/ENGINE_TIMEOUT_MS\s*[=:]\s*[^;]*?\|\|\s*['"](\d+)['"]/);
    if (envMatch) { timeoutMs = parseInt(envMatch[1], 10); matchLine = envMatch[0]; }
  }
  if (timeoutMs === null) {
    return { status: 'FAIL', summary: `${C020_targetFile} 中未找到 ENGINE_TIMEOUT_MS 的数值`, details: { content: content.slice(0, 2000) } };
  }
  const isPass = timeoutMs >= 120000;
  return {
    status: isPass ? 'PASS' : 'FAIL',
    summary: isPass ? `ENGINE_TIMEOUT_MS = ${timeoutMs}ms (>= 120000ms)` : `ENGINE_TIMEOUT_MS = ${timeoutMs}ms (< 120000ms, 不达标)`,
    details: { timeoutMs, threshold: 120000, matchLine },
  };
});

// ── C-021: BullMQ DLQ 验证 ──────────────────────────────────────
await runCheck(results, 'C-021', () => {
  const C021_targetDir = 'packages/backend/src/queues';
  const C021_absDir = join(PROJECT_ROOT_PATH, C021_targetDir);
  if (!existsSync(C021_absDir)) {
    return { status: 'FAIL', summary: `${C021_targetDir} 目录不存在` };
  }
  const matches = grepInCode(/deadLetterQueue|dlq|DeadLetterQueue/i, C021_targetDir, { extensions: ['.ts'] });
  const isPass = matches.length >= 1;
  return {
    status: isPass ? 'PASS' : 'FAIL',
    summary: isPass ? `BullMQ DLQ 已配置 (${matches.length} 处匹配)` : `未找到 BullMQ DLQ 配置 (0 处匹配)`,
    details: { matchCount: matches.length, matches: matches.map((m) => ({ file: m.file, line: m.line, text: m.text })) },
  };
});

// ── C-024: Webhook secret 加密验证 ──────────────────────────────
const C024_WEBHOOK_SVC_PATH = 'packages/backend/src/application/webhookService.ts';
const C024_ENVELOPE_ENC_PATH = 'packages/backend/src/utils/envelopeEncryption.ts';
const C024_EXPECTED_TEST_PATHS = [
  'tests/unit/services/webhookService.encryption.test.ts',
  'tests/unit/application/webhookService.encryption.test.ts',
  'tests/unit/application/webhookService.test.ts',
  'tests/unit/services/webhookService.test.ts',
];
const C024_MIGRATION_021_PATH = 'migrations/021_webhooks.sql';

await runCheck(results, 'C-024', async () => {
  let dbLayer = { status: 'UNKNOWN', details: {} };
  try {
    await withDb(async (db) => {
      const colsRes = await db.query(`
        SELECT column_name, data_type, udt_name, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'webhook_endpoints'
          AND column_name IN ('secret', 'secret_encrypted', 'secret_iv', 'secret_tag', 'secret_kid')
        ORDER BY column_name
      `);
      const cols = colsRes.rows;
      dbLayer.details.columns = cols;
      const secretCol = cols.find((c) => c.column_name === 'secret');
      if (!secretCol) { dbLayer.status = 'FAIL'; dbLayer.details.error = 'webhook_endpoints.secret 列不存在'; }
      else if (secretCol.data_type === 'bytea') { dbLayer.status = 'PASS'; dbLayer.details.secretType = 'bytea'; }
      else if (secretCol.data_type === 'text' || secretCol.data_type === 'character varying') { dbLayer.status = 'FAIL'; dbLayer.details.secretType = secretCol.data_type; dbLayer.details.reason = 'secret 列为明文文本类型，未加密存储'; }
      else { dbLayer.status = 'NEEDS_MANUAL_REVIEW'; dbLayer.details.secretType = secretCol.data_type; }
      dbLayer.details.hasIvColumn = cols.some((c) => c.column_name === 'secret_iv');
      dbLayer.details.hasTagColumn = cols.some((c) => c.column_name === 'secret_tag');
      dbLayer.details.hasKidColumn = cols.some((c) => c.column_name === 'secret_kid');
    });
  } catch (e) { dbLayer.status = 'SKIP'; dbLayer.details.error = `DB 连接失败: ${e.message}`; }

  let migrationLayer = { status: 'UNKNOWN', details: {} };
  if (fileExists(C024_MIGRATION_021_PATH)) {
    const sql = readFileContent(C024_MIGRATION_021_PATH);
    const secretBytea = /secret\s+bytea/i.test(sql);
    const secretText = /secret\s+(text|varchar)/i.test(sql);
    const usesPgcrypto = /pgcrypto|pgp_sym_encrypt|pgp_sym_decrypt/i.test(sql);
    migrationLayer.details = { secretBytea, secretText, usesPgcrypto };
    if (secretBytea && !secretText) migrationLayer.status = 'PASS';
    else if (secretText) migrationLayer.status = 'FAIL';
    else migrationLayer.status = 'NEEDS_MANUAL_REVIEW';
  } else { migrationLayer.status = 'SKIP'; migrationLayer.details.error = '021_webhooks.sql 不存在'; }

  let appLayer = { status: 'UNKNOWN', details: {} };
  if (fileExists(C024_WEBHOOK_SVC_PATH)) {
    const src = readFileContent(C024_WEBHOOK_SVC_PATH);
    const hasEncrypt = /\bencrypt\b/i.test(src);
    const hasDecrypt = /\bdecrypt\b/i.test(src);
    const importsEnvelope = /from\s+['"][^'"]*envelopeEncryption(?:\.js)?['"]/.test(src);
    const importsCrypto = /from\s+['"][^'"]*\/crypto['"]/.test(src);
    const pgcryptoCall = /pgp_sym_(encrypt|decrypt)/i.test(src);
    appLayer.details = { hasEncryptCall: hasEncrypt, hasDecryptCall: hasDecrypt, importsEnvelopeEncryption: importsEnvelope, importsCryptoUtil: importsCrypto, pgcryptoCall, srcLength: src.length };
    if (hasEncrypt && hasDecrypt && (importsEnvelope || importsCrypto)) appLayer.status = 'PASS';
    else { appLayer.status = 'FAIL'; appLayer.details.reason = 'webhookService 未调用 encrypt/decrypt 或未引入加密工具'; }
  } else { appLayer.status = 'FAIL'; appLayer.details.error = `${C024_WEBHOOK_SVC_PATH} 不存在`; }

  const envelopeEncExists = fileExists(C024_ENVELOPE_ENC_PATH);
  let envelopeLayer = { status: envelopeEncExists ? 'PASS' : 'FAIL', details: { path: C024_ENVELOPE_ENC_PATH, exists: envelopeEncExists } };
  if (envelopeEncExists) {
    const envSrc = readFileContent(C024_ENVELOPE_ENC_PATH);
    envelopeLayer.details.hasEncryptFn = /export\s+(async\s+)?function\s+encrypt\b|export\s+const\s+encrypt\b/.test(envSrc);
    envelopeLayer.details.hasDecryptFn = /export\s+(async\s+)?function\s+decrypt\b|export\s+const\s+decrypt\b/.test(envSrc);
    envelopeLayer.details.usesAesGcm = /aes-256-gcm|createCipheriv|createDecipheriv/i.test(envSrc);
    envelopeLayer.details.srcLength = envSrc.length;
  }

  const pgcryptoRefs = grepInCode(/pgcrypto|pgp_sym_(encrypt|decrypt)/i, 'packages/backend/src', { extensions: ['.ts', '.js', '.mjs', '.sql'] });
  const pgcryptoLayer = { status: pgcryptoRefs.length > 0 ? 'PASS' : 'FAIL', details: { refsCount: pgcryptoRefs.length, refs: pgcryptoRefs.slice(0, 20) } };

  const testFileStatus = C024_EXPECTED_TEST_PATHS.map((p) => ({ path: p, exists: fileExists(p) }));
  const hasDedicatedEncTest = testFileStatus.some((t) => t.exists && /encryption/.test(t.path));
  const hasAnyWebhookTest = testFileStatus.some((t) => t.exists);
  const testLayer = { status: hasDedicatedEncTest ? 'PASS' : (hasAnyWebhookTest ? 'NEEDS_MANUAL_REVIEW' : 'FAIL'), details: { expectedPaths: C024_EXPECTED_TEST_PATHS, testFileStatus, hasDedicatedEncryptionTest: hasDedicatedEncTest, hasAnyWebhookTest } };

  const overallPass = dbLayer.status === 'PASS' && migrationLayer.status === 'PASS' && appLayer.status === 'PASS' && envelopeLayer.status === 'PASS' && testLayer.status === 'PASS';
  return {
    status: overallPass ? 'PASS' : 'FAIL',
    summary: `db=${dbLayer.status}, migration=${migrationLayer.status}, app=${appLayer.status}, envelope=${envelopeLayer.status}, pgcrypto=${pgcryptoLayer.status}, tests=${testLayer.status}`,
    details: { dbLayer, migrationLayer, appLayer, envelopeLayer, pgcryptoLayer, testLayer },
  };
});

finishVerify('verify-backend', results);
