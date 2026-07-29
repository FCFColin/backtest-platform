// scripts/verify/C-002-rls-isolation.mjs
// C-002: RLS 多租户隔离真实性验证
// 预期 FAIL（智能体 A 自承 4 项遗留都跟 RLS 相关）
import { writeResult, withDb, fileExists, readFileContent, grepInCode } from './_lib.mjs';
import pg from 'pg';

const TENANT_TABLES = [
  'portfolios', 'backtest_runs', 'saved_configs', 'api_keys',
  'audit_logs', 'webhook_endpoints', 'webhook_deliveries',
  'stripe_customers', 'subscriptions', 'custom_tickers',
  'tactical_configs', 'org_memberships', 'invitations',
];

// 已知错误的 GUC 变量名（旧迁移中曾使用）
const WRONG_GUC_PATTERNS = [
  /app\.tenant_id/,
  /app\.org_id(?!_)/, // 不匹配 app.current_org_id
];

// 正确的 GUC 变量名
const CORRECT_GUC_NAMES = ['app.current_org_id', 'app.current_tenant_id'];

let result;
try {
  result = await (async () => {
    const superClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await superClient.connect();

    try {
      // === 检查 1: 应用连接是否用了非超级用户 ===
      // 数据来源：.env 文件中 DATABASE_URL 的 user 部分
      let envDbUser = null;
      let envAppDbUser = null;
      let envFileExists = fileExists('.env');
      if (envFileExists) {
        const envContent = readFileContent('.env');
        const lines = envContent.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          let m;
          if ((m = trimmed.match(/^DATABASE_URL=postgresql:\/\/([^:]+):/))) envDbUser = m[1];
          else if ((m = trimmed.match(/^APP_DATABASE_URL=postgresql:\/\/([^:]+):/))) envAppDbUser = m[1];
        }
      }
      const envUsingSuperuser = envDbUser === 'backtest' || envDbUser === 'postgres';

      // 应用运行时实际用的 user（检查 config 默认值）
      let configDefaultUser = null;
      const configPath = 'packages/backend/src/config/index.ts';
      if (fileExists(configPath)) {
        const cfg = readFileContent(configPath);
        // 粗略匹配 DATABASE_URL 默认值
        const m = cfg.match(/DATABASE_URL[^=]*=\s*['"]postgres:\/\/([^:]+):/);
        if (m) configDefaultUser = m[1];
      }

      // === 检查 2: backtest_app 角色存在且权限正确 ===
      const appRoleRes = await superClient.query(`
        SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolcreaterole, rolcreatedb
        FROM pg_roles WHERE rolname = 'backtest_app'
      `);
      const appRoleExists = appRoleRes.rows.length > 0;
      let appRoleIsCorrect = false;
      let appRoleInfo = null;
      if (appRoleExists) {
        appRoleInfo = appRoleRes.rows[0];
        appRoleIsCorrect =
          appRoleInfo.rolsuper === false &&
          appRoleInfo.rolbypassrls === false &&
          appRoleInfo.rolcanlogin === true;
      }

      // === 检查 3: 所有多租户表都有 RLS 并 FORCE ===
      const rlsRes = await superClient.query(`
        SELECT c.relname AS table_name,
               c.relrowsecurity AS rls_enabled,
               c.relforcerowsecurity AS rls_forced,
               n.nspname AS schema
        FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relname = ANY($1::text[])
        ORDER BY c.relname
      `, [TENANT_TABLES]);
      const foundRlsTables = rlsRes.rows.map((r) => r.table_name);
      const tablesNotExist = TENANT_TABLES.filter((t) => !foundRlsTables.includes(t));
      const tablesMissingRls = rlsRes.rows.filter((r) => !r.rls_enabled).map((r) => r.table_name);
      const tablesMissingForce = rlsRes.rows.filter((r) => r.rls_enabled && !r.rls_forced).map((r) => r.table_name);

      // === 检查 4: GUC 变量名统一 ===
      const policiesRes = await superClient.query(`
        SELECT schemaname, tablename, policyname, qual::text AS qual, with_check::text AS with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY($1::text[])
      `, [TENANT_TABLES]);

      const wrongGucPolicies = [];
      for (const p of policiesRes.rows) {
        const qualAndCheck = `${p.qual || ''} ${p.with_check || ''}`;
        for (const pat of WRONG_GUC_PATTERNS) {
          if (pat.test(qualAndCheck)) {
            wrongGucPolicies.push({
              table: p.tablename,
              policy: p.policyname,
              qual: p.qual,
              withcheck: p.with_check,
              matchedPattern: pat.source,
            });
            break;
          }
        }
      }

      // 检查应用代码中是否有错误的 GUC 引用
      const appCodeGucRefs = grepInCode(
        /app\.(tenant_id|org_id|current_org_id|current_tenant_id)/,
        'packages/backend/src',
        { extensions: ['.ts', '.js', '.mjs'] }
      );
      const wrongAppCodeGuc = appCodeGucRefs.filter((r) =>
        /app\.(tenant_id|org_id)\b/.test(r.text) &&
        !/app\.current_(org_id|tenant_id)/.test(r.text)
      );

      // === 检查 5: 实际跨租户查询（用 backtest_app 身份） ===
      let crossTenantTest = null;
      if (appRoleIsCorrect) {
        let appClient;
        try {
          appClient = new pg.Client({ connectionString: process.env.APP_DATABASE_URL });
          await appClient.connect();

          // 5a. 不设置 GUC，查询应被拒绝或返回 0
          let asNoneErr = null;
          let asNoneCount = null;
          try {
            const r = await appClient.query('SELECT COUNT(*)::int AS n FROM portfolios');
            asNoneCount = r.rows[0].n;
          } catch (e) {
            asNoneErr = e.message;
          }

          // 5b. 设置 org A
          let asAErr = null;
          let asACount = null;
          try {
            await appClient.query(`SET LOCAL app.current_org_id = '00000000-0000-0000-0000-000000000001'`);
            const r = await appClient.query('SELECT COUNT(*)::int AS n FROM portfolios');
            asACount = r.rows[0].n;
          } catch (e) {
            asAErr = e.message;
          }
          await appClient.query('RESET app.current_org_id');

          // 5c. 设置 org B
          let asBErr = null;
          let asBCount = null;
          try {
            await appClient.query(`SET LOCAL app.current_org_id = '00000000-0000-0000-0000-000000000002'`);
            const r = await appClient.query('SELECT COUNT(*)::int AS n FROM portfolios');
            asBCount = r.rows[0].n;
          } catch (e) {
            asBErr = e.message;
          }

          crossTenantTest = {
            asNone: { count: asNoneCount, error: asNoneErr },
            asOrgA: { count: asACount, error: asAErr },
            asOrgB: { count: asBCount, error: asBErr },
            isolationEnforced: asNoneErr !== null || asNoneCount === 0,
          };
        } catch (e) {
          crossTenantTest = { error: `无法以 backtest_app 身份连接: ${e.message}` };
        } finally {
          if (appClient) try { await appClient.end(); } catch {}
        }
      } else {
        crossTenantTest = { skipped: 'backtest_app 角色不存在或权限不正确' };
      }

      const pass =
        !envUsingSuperuser &&
        appRoleIsCorrect &&
        tablesNotExist.length === 0 &&
        tablesMissingRls.length === 0 &&
        tablesMissingForce.length === 0 &&
        wrongGucPolicies.length === 0 &&
        wrongAppCodeGuc.length === 0;

      return {
        status: pass ? 'PASS' : 'FAIL',
        summary: `env_super=${envUsingSuperuser}(${envDbUser}), app_role_ok=${appRoleIsCorrect}, missing_rls=${tablesMissingRls.length}, missing_force=${tablesMissingForce.length}, wrong_guc_policies=${wrongGucPolicies.length}, wrong_guc_appcode=${wrongAppCodeGuc.length}, tables_not_exist=${tablesNotExist.length}`,
        details: {
          envFileExists,
          envDbUser,
          envAppDbUser,
          configDefaultUser,
          envUsingSuperuser,
          appRoleExists,
          appRoleIsCorrect,
          appRoleInfo,
          tenantTablesChecked: TENANT_TABLES,
          tablesNotExist,
          tablesMissingRls,
          tablesMissingForce,
          rlsTableStatus: rlsRes.rows,
          policiesWithWrongGuc: wrongGucPolicies,
          wrongAppCodeGucRefs: wrongAppCodeGuc,
          correctGucNames: CORRECT_GUC_NAMES,
          crossTenantTest,
        },
      };
    } finally {
      await superClient.end();
    }
  })();
} catch (e) {
  result = {
    status: 'FAIL',
    summary: `脚本异常: ${e.message}`,
    details: { error: e.message, stack: e.stack },
  };
}

writeResult('C-002', result);
process.exit(0);

