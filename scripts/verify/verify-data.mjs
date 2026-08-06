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
        .map((l) => l.match(/upFile:\s*'([^']+)'\s*,\s*downFile:\s*'([^']+)'/))
        .filter(Boolean)
        .flatMap((m) => [m[1], m[2]])
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

finishVerify('verify-data', results);
