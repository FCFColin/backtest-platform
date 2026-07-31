// scripts/verify/verify-data.mjs
// 数据类验证聚合：C-001 (迁移链) + C-015 (ADR 索引) + C-016 (CHANGELOG) + C-017 (迁移一致性)
// 合并自：C-001-migration-chain.mjs + C-015-adr-index.mjs + C-016-changelog.mjs + C-017-migration-consistency.mjs
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  withDb,
  writeAggregatedResult,
  fileExists,
  readFileContent,
  runCmd,
  PROJECT_ROOT_PATH,
} from './_lib.mjs';

const results = {};

// ── C-001: 数据库迁移链完整性验证 ──────────────────────────────
const C001_EXPECTED_VERSIONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 29, 30,
];
const C001_FORBIDDEN_VERSIONS = [28];
const C001_EXPECTED_TABLES = [
  'audit_logs', 'webhook_endpoints', 'webhook_deliveries',
  'tactical_configs', 'announcements', 'custom_tickers',
  'roles', 'role_permissions', 'user_roles',
];

try {
  results['C-001'] = await withDb(async (db) => {
    const versionsRes = await db.query('SELECT version FROM schema_migrations ORDER BY version');
    const applied = versionsRes.rows.map((r) => r.version);
    const appliedSet = new Set(applied);

    const missingVersions = C001_EXPECTED_VERSIONS.filter((v) => !appliedSet.has(v));
    const forbiddenPresent = C001_FORBIDDEN_VERSIONS.filter((v) => appliedSet.has(v));

    const tablesRes = await db.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename = ANY($1::text[])`,
      [C001_EXPECTED_TABLES],
    );
    const foundTables = tablesRes.rows.map((r) => r.tablename);
    const missingTables = C001_EXPECTED_TABLES.filter((t) => !foundTables.includes(t));

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
        expectedCount: C001_EXPECTED_VERSIONS.length,
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
  results['C-001'] = {
    status: 'FAIL',
    summary: `脚本异常: ${e.message}`,
    details: { error: e.message, stack: e.stack },
  };
}

// ── C-015: ADR 索引验证 ────────────────────────────────────────
try {
  if (!fileExists('docs/adr/README.md')) {
    results['C-015'] = { status: 'FAIL', summary: 'docs/adr/README.md 不存在' };
  } else {
    const readme = readFileContent('docs/adr/README.md');
    const sections = readme.split(/^## /m);
    const activeSection = sections.find((s) => s.startsWith('当前有效')) ?? '';
    const deletedSection = sections.find((s) => s.startsWith('已删除')) ?? '';
    const activeAdrs = new Set(activeSection.match(/ADR-\d+/g) ?? []);
    const deletedAdrs = new Set(deletedSection.match(/ADR-\d+/g) ?? []);

    const adrDir = join(PROJECT_ROOT_PATH, 'docs', 'adr');
    let files = [];
    try {
      files = readdirSync(adrDir).filter((f) => /^ADR-\d+.*\.md$/.test(f));
    } catch {
      // 目录不存在或读取失败
    }
    const fileAdrs = new Set(
      files
        .map((f) => {
          const m = f.match(/^(ADR-\d+)/);
          return m ? m[1] : null;
        })
        .filter(Boolean),
    );

    const sortByNum = (a, b) =>
      parseInt(a.replace('ADR-', '')) - parseInt(b.replace('ADR-', ''));
    const inIndexNotInFiles = [...activeAdrs].filter((a) => !fileAdrs.has(a)).sort(sortByNum);
    const inFilesNotInIndex = [...fileAdrs]
      .filter((a) => !activeAdrs.has(a) && !deletedAdrs.has(a))
      .sort(sortByNum);

    const noDiff = inIndexNotInFiles.length === 0 && inFilesNotInIndex.length === 0;

    results['C-015'] = {
      status: noDiff ? 'PASS' : 'FAIL',
      summary: noDiff
        ? `ADR 索引与文件一致 (${fileAdrs.size} 个 ADR 文件, ${activeAdrs.size} 个有效, ${deletedAdrs.size} 个已删除/合并)`
        : `ADR 索引差异: 有效索引有但文件缺失 [${inIndexNotInFiles.join(', ')}], 文件有但索引缺失 [${inFilesNotInIndex.join(', ')}]`,
      details: {
        activeCount: activeAdrs.size,
        deletedCount: deletedAdrs.size,
        fileCount: fileAdrs.size,
        inIndexNotInFiles,
        inFilesNotInIndex,
        deletedAdrs: [...deletedAdrs].sort(sortByNum),
      },
    };
  }
} catch (e) {
  results['C-015'] = {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    details: { error: e.message },
  };
}

// ── C-016: CHANGELOG 验证 ──────────────────────────────────────
try {
  if (!fileExists('CHANGELOG.md')) {
    results['C-016'] = { status: 'FAIL', summary: 'CHANGELOG.md 不存在' };
  } else {
    const changelog = readFileContent('CHANGELOG.md');
    const dateMatches = [...changelog.matchAll(/^## \[[\d.]+\]\s*-\s*(\d{4}-\d{2}-\d{2})/gm)];
    const dates = dateMatches.map((m) => m[1]);

    if (dates.length === 0) {
      results['C-016'] = {
        status: 'FAIL',
        summary: 'CHANGELOG.md 中未找到日期条目 (格式: ## [x.y.z] - YYYY-MM-DD)',
        details: { contentHead: changelog.slice(0, 500) },
      };
    } else {
      const latestChangelogDate = dates[0];
      const gitR = runCmd('git log -1 --format=%ai');
      const gitOutput = gitR.out.trim();
      const latestCommitDate = gitOutput.split(' ')[0];

      if (!latestCommitDate) {
        results['C-016'] = {
          status: 'FAIL',
          summary: '无法获取 git log 最新提交日期',
          details: { gitOutput },
        };
      } else {
        const changelogTime = new Date(latestChangelogDate).getTime();
        const commitTime = new Date(latestCommitDate).getTime();
        const diffDays = (commitTime - changelogTime) / (1000 * 60 * 60 * 24);
        const isPass = diffDays <= 7;

        results['C-016'] = {
          status: isPass ? 'PASS' : 'FAIL',
          summary: isPass
            ? `CHANGELOG 最新日期 ${latestChangelogDate} 在最新提交 ${latestCommitDate} 7 天内`
            : `CHANGELOG 过期: 最新日期 ${latestChangelogDate}, 最新提交 ${latestCommitDate}, 差 ${diffDays.toFixed(1)} 天`,
          details: {
            latestChangelogDate,
            latestCommitDate,
            diffDays: parseFloat(diffDays.toFixed(1)),
            allChangelogDates: dates.slice(0, 5),
          },
        };
      }
    }
  }
} catch (e) {
  results['C-016'] = {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    details: { error: e.message },
  };
}

// ── C-017: 迁移文件命名一致性验证 ─────────────────────────────
try {
  const C017_MIGRATIONS_DIR_REL = 'migrations';
  const C017_MIGRATIONS_REG_PATH = 'packages/backend/src/db/migrations.ts';

  const migrationsDir = join(process.cwd(), C017_MIGRATIONS_DIR_REL);
  let allFiles = [];
  try {
    allFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  } catch (e) {
    results['C-017'] = {
      status: 'FAIL',
      summary: `无法读取 migrations 目录: ${e.message}`,
      details: { error: e.message },
    };
  }

  if (!results['C-017']) {
    const files028 = allFiles.filter((f) => /^028_/.test(f));
    const files029Up = allFiles.filter((f) => /^029_announcements\.sql$/.test(f));
    const files029Down = allFiles.filter((f) => /^029_announcements_down\.sql$/.test(f));
    const files030Up = allFiles.filter((f) => /^030_custom_tickers\.sql$/.test(f));
    const files030Down = allFiles.filter((f) => /^030_custom_tickers_down\.sql$/.test(f));

    let regContent = '';
    let regFileExists = fileExists(C017_MIGRATIONS_REG_PATH);
    if (regFileExists) {
      regContent = readFileContent(C017_MIGRATIONS_REG_PATH);
    }
    const hasRegV29 = /version:\s*29\b/.test(regContent);
    const hasRegV30 = /version:\s*30\b/.test(regContent);
    const hasRegV28 = /version:\s*28\b/.test(regContent);
    const v28RealReg = regContent
      .split('\n')
      .filter((l) => /version:\s*28\b/.test(l) && !/^\s*\/\//.test(l) && !/^\s*\*/.test(l));

    let dbHasV28 = null;
    let dbAppliedVersions = [];
    let dbError = null;
    try {
      await withDb(async (db) => {
        const r = await db.query('SELECT version FROM schema_migrations ORDER BY version');
        dbAppliedVersions = r.rows.map((x) => x.version);
        dbHasV28 = dbAppliedVersions.includes(28);
      });
    } catch (e) {
      dbError = e.message;
    }

    const fsClean = files028.length === 0;
    const regClean = !hasRegV28 || v28RealReg.length === 0;
    const dbClean = dbHasV28 === false;
    const filesComplete =
      files029Up.length === 1 && files029Down.length === 1 &&
      files030Up.length === 1 && files030Down.length === 1;
    const regComplete = hasRegV29 && hasRegV30;
    const pass = fsClean && regClean && dbClean && filesComplete && regComplete && !dbError;

    results['C-017'] = {
      status: pass ? 'PASS' : 'FAIL',
      summary: `fs_028=${files028.length}, reg_v28_real=${v28RealReg.length}, db_v28=${dbHasV28}, files_complete=${filesComplete}, reg_v29=${hasRegV29}, reg_v30=${hasRegV30}, db_err=${!!dbError}`,
      details: {
        migrationsDirFiles: allFiles,
        files028,
        files029Up, files029Down,
        files030Up, files030Down,
        filesComplete,
        regFileExists,
        regHasV29: hasRegV29,
        regHasV30: hasRegV30,
        regHasV28Any: hasRegV28,
        regV28NonCommentLines: v28RealReg,
        regComplete,
        dbHasV28,
        dbAppliedVersions,
        dbError,
      },
    };
  }
} catch (e) {
  results['C-017'] = {
    status: 'FAIL',
    summary: `脚本异常: ${e.message}`,
    details: { error: e.message, stack: e.stack },
  };
}

writeAggregatedResult('verify-data', results);
process.exit(0);
