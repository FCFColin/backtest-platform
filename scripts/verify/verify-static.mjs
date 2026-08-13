// scripts/verify/verify-static.mjs
// 纯静态 CRITICAL 修复验证：不依赖 DB/前端服务，CI 始终执行（--skip-db 仅跳过 verify-backend.mjs，不影响本脚本）
// C-015 (ADR) + C-016 (CHANGELOG) + C-017 (migration chain) + C-018 (singleflight) + C-019 (frontend dead code)
// + C-020 (engine timeout) + C-021 (BullMQ DLQ) + C-022 (OpenAPI) + C-023 (degraded)
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  runCmd,
  fileExists,
  readFileContent,
  grepInCode,
  runCheck,
  finishVerify,
  PROJECT_ROOT_PATH,
} from './_lib.mjs';

const results = {};

const regLines = (p) =>
  readFileContent(p)
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l));

// ── C-015: ADR 索引与文件一致性 ──────────────────────────────
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

// ── C-016: CHANGELOG 新鲜度（最近提交 7 天内）───────────────
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

// ── C-017: 迁移文件与注册表对齐 ───────────────────────────────
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

// ── C-018: 单飞已退役（DADR-045）──────────────────────────────
await runCheck(results, 'C-018', () => {
  const missing = [
    [/submitQueueJob\(|createBacktestWorker\(/, 'queue'],
    [/getBacktestResultCache|setBacktestResultCache/, 'cache'],
    [/WORKER_CONCURRENCY/, 'concurrency'],
  ].filter(([re]) => !grepInCode(re, 'packages/backend/src', { extensions: ['.ts'] }).length);
  const ok = missing.length === 0;
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: ok ? '队列+缓存+并发齐备' : `缺失: ${missing.map(([, n]) => n).join('/')}`,
  };
});

// ── C-019: 前端死代码 useEngineHealth 已删除 ──────────────────
await runCheck(results, 'C-019', () => {
  const refs = grepInCode(/useEngineHealth/, 'packages/frontend/src', {
    extensions: ['.ts', '.tsx'],
  });
  return {
    status: refs.length === 0 ? 'PASS' : 'FAIL',
    summary:
      refs.length === 0
        ? 'packages/frontend/src 中 useEngineHealth 0 匹配，死代码已删除'
        : '仍存在 ' + refs.length + ' 处 useEngineHealth 引用',
    details: {
      matchCount: refs.length,
      matches: refs.slice(0, 10),
      searchDir: 'packages/frontend/src',
    },
  };
});

// ── C-020: engine timeout 验证 ────────────────────────────────
await runCheck(results, 'C-020', () => {
  const f = 'packages/backend/src/config/env.ts';
  if (!fileExists(f)) return { status: 'FAIL', summary: `${f} 不存在` };
  const content = readFileContent(f);
  const timeoutMs =
    content
      .match(
        /ENGINE_TIMEOUT_MS\s*[=:]\s*(\d+)|ENGINE_TIMEOUT_MS\s*[=:]\s*\w+\([^)]*['"](\d+)['"]\)|ENGINE_TIMEOUT_MS\s*[=:]\s*[^;]*?\|\|\s*['"](\d+)['"]/,
      )
      ?.slice(1)
      .find((v) => v !== undefined) || null;
  if (timeoutMs === null) return { status: 'FAIL', summary: `${f} 中未找到 ENGINE_TIMEOUT_MS` };
  const ok = parseInt(timeoutMs, 10) >= 120000;
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: `ENGINE_TIMEOUT_MS = ${timeoutMs}ms (${ok ? '>=' : '<'} 120000ms)`,
    details: { timeoutMs: parseInt(timeoutMs, 10) },
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

// ── C-022: OpenAPI server.url 对齐当前端口 ───────────────────
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

// ── C-023: ADR-008 degraded 字段验证 ──────────────────────────
// engine/compute 端点 fail-closed 503 无 degraded（ADR-008）；degraded 仅限数据端点(Go data-fetcher 降级)
await runCheck(results, 'C-023', () => {
  const refs = grepInCode(/degraded/, 'packages/backend/src/routes', {
    extensions: ['.ts'],
  }).filter((m) => !m.file.includes('dataRoutes') && !m.file.includes('routeUtils'));
  const pass = refs.length === 0;
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: pass
      ? 'compute 路由无 degraded 字段 (ADR-008)'
      : `${refs.length} 处 compute degraded 引用`,
  };
});

finishVerify('verify-static', results);
