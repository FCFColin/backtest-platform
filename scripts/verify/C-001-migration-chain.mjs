// scripts/verify/C-001-migration-chain.mjs
// C-001: 数据库迁移链完整性验证
import { withDb, writeResult } from './_lib.mjs';

const EXPECTED_VERSIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 29, 30,
];
const FORBIDDEN_VERSIONS = [28];

const EXPECTED_TABLES = [
  'audit_logs', 'webhook_endpoints', 'webhook_deliveries',
  'tactical_configs', 'announcements', 'custom_tickers',
  'roles', 'role_permissions', 'user_roles',
];

let result;
try {
  result = await withDb(async (db) => {
    const versionsRes = await db.query('SELECT version FROM schema_migrations ORDER BY version');
    const applied = versionsRes.rows.map((r) => r.version);
    const appliedSet = new Set(applied);

    const missingVersions = EXPECTED_VERSIONS.filter((v) => !appliedSet.has(v));
    const forbiddenPresent = FORBIDDEN_VERSIONS.filter((v) => appliedSet.has(v));

    const tablesRes = await db.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename = ANY($1::text[])`,
      [EXPECTED_TABLES],
    );
    const foundTables = tablesRes.rows.map((r) => r.tablename);
    const missingTables = EXPECTED_TABLES.filter((t) => !foundTables.includes(t));

    const timescaleExtRes = await db.query(
      `SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb'`,
    );
    const timescaleInstalled = timescaleExtRes.rows.length > 0;

    let pricesIsHypertable = false;
    let hypertableInfo = null;
    if (timescaleInstalled) {
      const hyperRes = await db.query(
        `SELECT hypertable_name, num_chunks
         FROM timescaledb_information.hypertables
         WHERE hypertable_schema = 'public' AND hypertable_name = 'prices'`,
      );
      pricesIsHypertable = hyperRes.rows.length > 0;
      hypertableInfo = hyperRes.rows[0] || null;
    }

    let announcementsIdType = null;
    let announcementsIdSchema = null;
    if (!missingTables.includes('announcements')) {
      const annColsRes = await db.query(
        `SELECT column_name, data_type, udt_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'announcements'
           AND column_name = 'id'`,
      );
      const row = annColsRes.rows[0];
      if (row) {
        announcementsIdType = row.data_type;
        announcementsIdSchema = row.udt_name;
      }
    }

    const diagnosticCounts = {};
    for (const t of ['announcements', 'custom_tickers', 'tactical_configs']) {
      if (!missingTables.includes(t)) {
        try {
          const c = await db.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
          diagnosticCounts[t] = c.rows[0].n;
        } catch (e) {
          diagnosticCounts[t] = `ERR: ${e.message}`;
        }
      }
    }

    const pass =
      missingVersions.length === 0 &&
      forbiddenPresent.length === 0 &&
      missingTables.length === 0 &&
      timescaleInstalled &&
      pricesIsHypertable &&
      announcementsIdType === 'uuid';

    return {
      status: pass ? 'PASS' : 'FAIL',
      summary: `applied=${applied.length} (expect 29), missing=${missingVersions.length}, forbidden_present=${forbiddenPresent.length}, missing_tables=${missingTables.length}, timescale=${timescaleInstalled}, prices_hypertable=${pricesIsHypertable}, announcements_id_type=${announcementsIdType}`,
      details: {
        appliedCount: applied.length,
        appliedVersions: applied,
        expectedCount: EXPECTED_VERSIONS.length,
        missingVersions,
        forbiddenVersionsPresent: forbiddenPresent,
        foundTables,
        missingTables,
        timescaleInstalled,
        timescaleVersion: timescaleExtRes.rows[0]?.extversion || null,
        pricesIsHypertable,
        hypertableInfo,
        announcementsIdType,
        announcementsIdUdt: announcementsIdSchema,
        diagnosticCounts,
      },
    };
  });
} catch (e) {
  result = {
    status: 'FAIL',
    summary: `脚本异常: ${e.message}`,
    details: { error: e.message, stack: e.stack },
  };
}

writeResult('C-001', result);
process.exit(0);
