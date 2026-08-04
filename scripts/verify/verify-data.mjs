import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  withDb,
  fileExists,
  readFileContent,
  runCmd,
  runCheck,
  finishVerify,
  PROJECT_ROOT_PATH,
} from './_lib.mjs';

const results = {};

const regLines = (path) =>
  readFileContent(path)
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l));

const C001_EXPECTED_VERSIONS = (() => {
  const regPath = 'packages/backend/src/db/migrations.ts';
  if (!fileExists(regPath)) return [];
  return regLines(regPath)
    .map((l) => l.match(/version:\s*(\d+)/)?.[1])
    .filter(Boolean)
    .map(Number);
})();
const C001_EXPECTED_TABLES = [
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
    const versionsRes = await db.query('SELECT version FROM schema_migrations ORDER BY version');
    const applied = versionsRes.rows.map((r) => r.version);
    const appliedSet = new Set(applied);

    const missingVersions = C001_EXPECTED_VERSIONS.filter((v) => !appliedSet.has(v));
    const unexpectedVersions = applied.filter((v) => !C001_EXPECTED_VERSIONS.includes(v));

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
      unexpectedVersions.length === 0 &&
      missingTables.length === 0 &&
      timescaleInstalled &&
      pricesIsHypertable &&
      announcementsIdType === 'uuid';

    return {
      status: pass ? 'PASS' : 'FAIL',
      summary: `applied=${applied.length} (expect ${C001_EXPECTED_VERSIONS.length}), missing=${missingVersions.length}, unexpected=${unexpectedVersions.length}, missing_tables=${missingTables.length}, timescale=${timescaleInstalled}, prices_hypertable=${pricesIsHypertable}, announcements_id_type=${announcementsIdType}`,
      details: {
        appliedCount: applied.length,
        appliedVersions: applied,
        expectedCount: C001_EXPECTED_VERSIONS.length,
        missingVersions,
        unexpectedVersions,
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
  }),
);

await runCheck(results, 'C-015', () => {
  if (!fileExists('docs/adr/README.md')) {
    return { status: 'FAIL', summary: 'docs/adr/README.md 不存在' };
  }
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
  } catch {}
  const fileAdrs = new Set(
    files
      .map((f) => {
        const m = f.match(/^(ADR-\d+)/);
        return m ? m[1] : null;
      })
      .filter(Boolean),
  );

  const sortByNum = (a, b) => parseInt(a.replace('ADR-', '')) - parseInt(b.replace('ADR-', ''));
  const inIndexNotInFiles = [...activeAdrs].filter((a) => !fileAdrs.has(a)).sort(sortByNum);
  const inFilesNotInIndex = [...fileAdrs]
    .filter((a) => !activeAdrs.has(a) && !deletedAdrs.has(a))
    .sort(sortByNum);

  const noDiff = inIndexNotInFiles.length === 0 && inFilesNotInIndex.length === 0;

  return {
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
});

await runCheck(results, 'C-016', () => {
  if (!fileExists('CHANGELOG.md')) {
    return { status: 'FAIL', summary: 'CHANGELOG.md 不存在' };
  }
  const changelog = readFileContent('CHANGELOG.md');
  const dateMatches = [...changelog.matchAll(/^## \[[\d.]+\]\s*-\s*(\d{4}-\d{2}-\d{2})/gm)];
  const dates = dateMatches.map((m) => m[1]);

  if (dates.length === 0) {
    return {
      status: 'FAIL',
      summary: 'CHANGELOG.md 中未找到日期条目 (格式: ## [x.y.z] - YYYY-MM-DD)',
      details: { contentHead: changelog.slice(0, 500) },
    };
  }
  const latestChangelogDate = dates[0];
  const gitR = runCmd('git log -1 --format=%ai');
  const gitOutput = gitR.out.trim();
  const latestCommitDate = gitOutput.split(' ')[0];

  if (!latestCommitDate) {
    return {
      status: 'FAIL',
      summary: '无法获取 git log 最新提交日期',
      details: { gitOutput },
    };
  }
  const changelogTime = new Date(latestChangelogDate).getTime();
  const commitTime = new Date(latestCommitDate).getTime();
  const diffDays = (commitTime - changelogTime) / (1000 * 60 * 60 * 24);
  const isPass = diffDays <= 7;

  return {
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
});

await runCheck(results, 'C-017', () => {
  const C017_MIGRATIONS_DIR_REL = 'migrations';
  const C017_MIGRATIONS_REG_PATH = 'packages/backend/src/db/migrations.ts';

  const migrationsDir = join(process.cwd(), C017_MIGRATIONS_DIR_REL);
  let allFiles = [];
  try {
    allFiles = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  } catch (e) {
    return {
      status: 'FAIL',
      summary: `无法读取 migrations 目录: ${e.message}`,
      details: { error: e.message },
    };
  }

  const regFileExists = fileExists(C017_MIGRATIONS_REG_PATH);
  const registeredFiles = regFileExists
    ? regLines(C017_MIGRATIONS_REG_PATH)
        .map((l) => {
          const m = l.match(/upFile:\s*'([^']+)'\s*,\s*downFile:\s*'([^']+)'/);
          return m ? [m[1], m[2]] : null;
        })
        .filter(Boolean)
        .flat()
    : [];
  const orphans = allFiles.filter((f) => !registeredFiles.includes(f));
  const missingRegFiles = registeredFiles.filter((f) => !allFiles.includes(f));
  const pass = regFileExists && orphans.length === 0 && missingRegFiles.length === 0;

  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: `orphans=${orphans.length}, missing_reg_files=${missingRegFiles.length}, registered=${registeredFiles.length}`,
    details: {
      migrationsDirFiles: allFiles,
      registeredFiles,
      orphans,
      missingRegFiles,
      regFileExists,
    },
  };
});

finishVerify('verify-data', results);
