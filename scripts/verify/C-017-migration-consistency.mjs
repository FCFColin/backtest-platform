// scripts/verify/C-017-migration-consistency.mjs
// C-017: 迁移文件命名一致性验证（v028 已删除，v029/v030 重命名）
import { writeResult, withDb, fileExists, readFileContent } from './_lib.mjs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR_REL = 'migrations';
const MIGRATIONS_REG_PATH = 'packages/backend/src/db/migrations.ts';

let result;
try {
  result = await (async () => {
    // 1. migrations 目录无 028_*.sql 文件
    const migrationsDir = join(process.cwd(), MIGRATIONS_DIR_REL);
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
    const files028 = allFiles.filter((f) => /^028_/.test(f));
    const files029Up = allFiles.filter((f) => /^029_announcements\.sql$/.test(f));
    const files029Down = allFiles.filter((f) => /^029_announcements_down\.sql$/.test(f));
    const files030Up = allFiles.filter((f) => /^030_custom_tickers\.sql$/.test(f));
    const files030Down = allFiles.filter((f) => /^030_custom_tickers_down\.sql$/.test(f));

    // 2. migrations.ts 注册了 v29, v30
    let regContent = '';
    let regFileExists = fileExists(MIGRATIONS_REG_PATH);
    if (regFileExists) {
      regContent = readFileContent(MIGRATIONS_REG_PATH);
    }
    // 匹配 version: 29 / version: 30 / version: 28
    const hasRegV29 = /version:\s*29\b/.test(regContent);
    const hasRegV30 = /version:\s*30\b/.test(regContent);
    const hasRegV28 = /version:\s*28\b/.test(regContent);
    // 检查 v28 是否仅在注释中（注释行的 version: 28 不算注册）
    const v28RealReg = regContent
      .split('\n')
      .filter((l) => /version:\s*28\b/.test(l) && !/^\s*\/\//.test(l) && !/^\s*\*/.test(l));

    // 3. schema_migrations 表中无 version=28
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

    // 4. 综合：v028 是否在所有三个维度均不存在
    const fsClean = files028.length === 0;
    const regClean = !hasRegV28 || v28RealReg.length === 0;
    const dbClean = dbHasV28 === false;

    // 5. v029/v030 文件齐全 + 注册正确
    const filesComplete =
      files029Up.length === 1 && files029Down.length === 1 &&
      files030Up.length === 1 && files030Down.length === 1;
    const regComplete = hasRegV29 && hasRegV30;

    const pass =
      fsClean && regClean && dbClean && filesComplete && regComplete && !dbError;

    return {
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
  })();
} catch (e) {
  result = {
    status: 'FAIL',
    summary: `脚本异常: ${e.message}`,
    details: { error: e.message, stack: e.stack },
  };
}

writeResult('C-017', result);
process.exit(0);
