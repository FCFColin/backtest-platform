// scripts/verify/verify-static.mjs
// 纯静态 CRITICAL 修复验证：不依赖 DB/前端服务，CI 始终执行
// C-015 (ADR) + C-016 (CHANGELOG) + C-017 (migration chain) + C-018 (singleflight) + C-019 (frontend dead code)
// + C-020 (engine timeout) + C-021 (BullMQ DLQ) + C-022 (OpenAPI) + C-023 (degraded)
// + C-027 (AGENTS 数字机器校验) + C-028 (prettier format)
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';
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

// ── C-015: ADR 索引与文件一致性 ──────────────────────────────
await runCheck(results, 'C-015', () => {
  if (!fileExists('docs/adr/README.md'))
    return { status: 'FAIL', summary: 'docs/adr/README.md 不存在' };
  const readme = readFileContent('docs/adr/README.md');
  const sections = readme.split(/^## /m);
  // (?<!D) 排除 "DADR-003" 等已删除条目中的子串，避免误把活跃 ADR 记入已删除集合
  const adrIds = (s) => s.match(/(?<!D)ADR-\d+/g) ?? [];
  const activeAdrs = new Set(adrIds(sections.find((s) => s.startsWith('当前有效')) ?? ''));
  const deletedAdrs = new Set(adrIds(sections.find((s) => s.startsWith('已删除')) ?? ''));
  let listing = [];
  try {
    listing = readdirSync(join(PROJECT_ROOT_PATH, 'docs', 'adr'));
  } catch {}
  const files = listing.filter((f) => /^ADR-\d+.*\.md$/.test(f));
  const fileAdrs = new Set(files.map((f) => f.match(/^(ADR-\d+)/)?.[1]).filter(Boolean));
  const inIndexNotInFiles = [...activeAdrs].filter((a) => !fileAdrs.has(a));
  const inFilesNotInIndex = [...fileAdrs].filter((a) => !activeAdrs.has(a) && !deletedAdrs.has(a));
  // DADR：已删除决策仅存索引条目；磁盘出现 DADR-*.md 文件须在"已删除"段登记（ADR-012 防复活未登记）
  const dadrSection = sections.find((s) => s.startsWith('已删除')) ?? '';
  const dadrUnregistered = listing
    .filter((f) => /^DADR-\d+.*\.md$/.test(f))
    .filter((f) => !new RegExp(`DADR-${f.match(/^DADR-(\d+)/)[1]}\\b`).test(dadrSection));
  const ok =
    inIndexNotInFiles.length === 0 &&
    inFilesNotInIndex.length === 0 &&
    dadrUnregistered.length === 0;
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: ok
      ? `ADR 索引与文件一致 (${fileAdrs.size} 文件, ${activeAdrs.size} 有效, ${deletedAdrs.size} 已删除, ${dadrUnregistered.length} DADR 未登记)`
      : `差异: 索引有文件缺失 [${inIndexNotInFiles}], 文件有索引缺失 [${inFilesNotInIndex}], DADR 未登记 [${dadrUnregistered}]`,
    details: {
      activeCount: activeAdrs.size,
      fileCount: fileAdrs.size,
      inIndexNotInFiles,
      inFilesNotInIndex,
      dadrUnregistered,
    },
  };
});

// ── C-016: CHANGELOG 新鲜度 + 版本一致性 + Unreleased 非空 + 沉默提交双门 ──
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
  const latestVersion = changelog.match(/^## \[([\d.]+)\]\s*-\s*\d{4}-\d{2}-\d{2}/m)?.[1];
  const pkgVersion = JSON.parse(readFileContent('package.json')).version;
  const reasons = [];
  if (diffDays > 7) reasons.push(`新鲜度差 ${diffDays.toFixed(1)} 天`);
  if (latestVersion !== pkgVersion)
    reasons.push(`版本 ${latestVersion} 与 package.json ${pkgVersion} 不一致`);
  const unreleased = changelog.match(/## \[Unreleased\]\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? '';
  const unreleasedItems = unreleased.split('\n').filter((l) => l.trim().startsWith('-')).length;
  if (unreleasedItems === 0) reasons.push('Unreleased 为空（应记录未发布改动）');
  // 双门 2（沉默提交数）：changelog 最后日期之后落库的提交 > 40 视为回补失职——
  // 事件驱动的新鲜度断言在密集提交期可因"恰有旧条目"而漏报，提交量计数堵该缺口。
  // 用 execFileSync 避免 shell 注入面（date 字面量由脚本生成，不拼接用户输入）。
  let commitsAfter = -1;
  try {
    const out = execFileSync(
      'git',
      ['rev-list', '--count', `--since=${latestDate} 23:59:59`, 'HEAD'],
      {
        cwd: PROJECT_ROOT_PATH,
        encoding: 'utf-8',
        timeout: 30000,
      },
    ).trim();
    commitsAfter = parseInt(out, 10);
  } catch (e) {
    return {
      status: 'WARN',
      summary: `C-016 沉默提交门无法执行: ${e.message.slice(0, 120)}`,
      details: { latestDate },
    };
  }
  if (commitsAfter > 40) reasons.push(`changelog 日期后已有 ${commitsAfter} 次提交未回补（>40）`);
  const ok = reasons.length === 0;
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: ok
      ? `CHANGELOG ${latestDate} 新鲜 + 版本 ${pkgVersion} 一致 + Unreleased ${unreleasedItems} 条 + 沉默提交 ${commitsAfter}`
      : `C-016 失败: ${reasons.join('; ')}`,
    details: { latestDate, diffDays, latestVersion, pkgVersion, unreleasedItems, commitsAfter },
  };
});

// ── C-017: 迁移文件与注册表对齐 ───────────────────────────────
// 委托 scripts/check-migrations.mjs（命名/序号/注册表全量检查），避免双份解析漂移
await runCheck(results, 'C-017', () => {
  const r = runCmd('node scripts/check-migrations.mjs', { timeout: 120000 });
  return {
    status: r.code === 0 ? 'PASS' : 'FAIL',
    summary:
      r.code === 0 ? 'check-migrations.mjs 通过' : `check-migrations.mjs 失败 (exit ${r.code})`,
    details: { exitCode: r.code, outputTail: (r.out + r.err).slice(-2000) },
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
  const timeoutMs = readFileContent(f).match(/ENGINE_TIMEOUT_MS[^\n]*?(\d+)/)?.[1] || null;
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
// jobSubmission.ts 豁免：ADR-008 补充条款（2026-08-24 C-023 裁决）——其 degraded 为
// 数据级标记（所用行情缺失），与服务级 fail-closed 正交，P-2 要求其可见。
await runCheck(results, 'C-023', () => {
  const refs = grepInCode(/degraded/, 'packages/backend/src/routes', {
    extensions: ['.ts'],
  }).filter(
    (m) =>
      !m.file.includes('dataRoutes') &&
      !m.file.includes('routeUtils') &&
      !m.file.includes('jobSubmission'),
  );
  const pass = refs.length === 0;
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: pass
      ? 'compute 路由无 degraded 字段 (ADR-008)'
      : `${refs.length} 处 compute degraded 引用`,
  };
});

// ── C-027: AGENTS 净生产数字与 LOC ledger 末条机器校验 ─────────
// 口径：AGENTS.md 中"净生产代码"后的数字（G-1 权威口径）对比 loc-ledger.jsonl 末条 net 值。
// 判定：偏差 >500 且 ledger 末条日期新于 AGENTS.md 文件修改时间 → FAIL（手册数字过时）；
//       其余偏差情形 → WARN 说明原因（账本滞后于手册时无裁决权）；ledger 缺失 → SKIP。
await runCheck(results, 'C-027', () => {
  if (!fileExists('docs/audit/loc-ledger.jsonl'))
    return { status: 'SKIP', summary: 'docs/audit/loc-ledger.jsonl 缺失，跳过 AGENTS 数字校验' };
  const agentsRel = ['AGENTS.md', 'docs/AGENTS.md'].find((p) => fileExists(p));
  if (!agentsRel) return { status: 'FAIL', summary: 'AGENTS.md 未找到（根目录与 docs/ 均无）' };
  const agents = readFileContent(agentsRel);
  // 手册内多处出现"净生产代码"；取标注 G-1 门禁口径的那条（唯一权威），否则退回首个匹配
  const netMatches = [...agents.matchAll(/净生产代码\s*([0-9,]+)/g)].map((m) =>
    Number(m[1].replace(/,/g, '')),
  );
  if (netMatches.length === 0)
    return { status: 'SKIP', summary: 'AGENTS.md 中未找到"净生产代码"数字' };
  const g1Line = agents.split('\n').find((l) => /净生产代码/.test(l) && /G-1/.test(l));
  const agentsNet = g1Line
    ? Number((g1Line.match(/净生产代码\s*([0-9,]+)/) ?? [])[1]?.replace(/,/g, '') ?? NaN)
    : netMatches[0];
  if (!Number.isFinite(agentsNet))
    return { status: 'WARN', summary: 'AGENTS.md G-1 净生产数字解析失败', details: { netMatches } };
  const lines = readFileContent('docs/audit/loc-ledger.jsonl')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let last = null;
  for (const l of lines) {
    try {
      const j = JSON.parse(l);
      if (typeof j.net === 'number') last = j;
    } catch {}
  }
  if (!last) {
    // ledger 尚无 net 字段（净值口径未入账）：退化为全仓 total 对比（count-loc.ps1 同口径），
    // 从 AGENTS.md"全仓 N 行"标题行取数，同 FAIL/WARN 判定
    for (const l of lines) {
      try {
        const j = JSON.parse(l);
        if (typeof j.total === 'number') last = j;
      } catch {}
    }
    const allRepo = agents.match(/全仓\s*([0-9,]+)\s*行/)?.[1];
    if (!last || !allRepo)
      return {
        status: 'SKIP',
        summary: 'ledger 末条无 net/total 字段或 AGENTS 无全仓数字——无法机器对比',
        details: { ledgerLines: lines.length },
      };
    const agentsTotal = Number(allRepo.replace(/,/g, ''));
    const agentsMtime = statSync(join(PROJECT_ROOT_PATH, agentsRel.split('/').join(sep))).mtime;
    const ledgerNewer = new Date(last.date) > new Date(agentsMtime.toDateString());
    const deviation = Math.abs(last.total - agentsTotal);
    if (deviation > 500 && ledgerNewer) {
      return {
        status: 'FAIL',
        summary: `AGENTS 全仓 ${agentsTotal} 与 ledger 末条 total ${last.total} 偏差 ${deviation}（>500），且 ledger（${last.date}）新于 AGENTS 修改时间——手册数字过时（净生产口径待 ledger 入账后启用）`,
        details: { agentsTotal, ledgerTotal: last.total, deviation, ledgerDate: last.date },
      };
    }
    return {
      status: 'WARN',
      summary:
        deviation > 500
          ? `全仓偏差 ${deviation}（>500）但 ledger 末条（${last.date}）不新于 AGENTS.md 修改时间（${agentsMtime.toISOString().slice(0, 10)}）——无裁决权，仅告警（net 口径未入账）`
          : `AGENTS 全仓 ${agentsTotal} 与 ledger 末条 total ${last.total} 偏差 ${deviation}（≤500，容差内）`,
      details: { agentsTotal, ledgerTotal: last.total, deviation, ledgerDate: last.date },
    };
  }
  const agentsMtime = statSync(join(PROJECT_ROOT_PATH, agentsRel.split('/').join(sep))).mtime;
  const ledgerNewer = new Date(last.date) > new Date(agentsMtime.toDateString());
  const deviation = Math.abs(last.net - agentsNet);
  if (deviation > 500 && ledgerNewer) {
    return {
      status: 'FAIL',
      summary: `AGENTS 净生产 ${agentsNet} 与 ledger 末条 net ${last.net} 偏差 ${deviation}（>500），且 ledger（${last.date}）新于 AGENTS 修改时间——手册数字过时`,
      details: { agentsNet, ledgerNet: last.net, deviation, ledgerDate: last.date },
    };
  }
  return {
    status: 'WARN',
    summary:
      deviation > 500
        ? `偏差 ${deviation}（>500）但 ledger 末条（${last.date}）不新于 AGENTS.md 修改时间（${agentsMtime.toISOString().slice(0, 10)}）——无裁决权，仅告警`
        : `AGENTS 净生产 ${agentsNet} 与 ledger 末条 net ${last.net} 偏差 ${deviation}（≤500，容差内）`,
    details: { agentsNet, ledgerNet: last.net, deviation, ledgerDate: last.date, ledgerNewer },
  };
});

// ── C-028: prettier 格式一致性（全仓 --check）──────────────────
await runCheck(results, 'C-028', () => {
  const r = runCmd('npx prettier --check .', { timeout: 120000 });
  const out = (r.out + r.err)
    .split('\n')
    .filter((l) => l.includes('[warn]'))
    .slice(0, 15);
  return {
    status: r.code === 0 ? 'PASS' : 'FAIL',
    summary:
      r.code === 0
        ? 'prettier --check 全仓通过'
        : `prettier 不一致文件 ${out.length}+ 个（exit ${r.code}）: ${out.join(' | ').slice(0, 300)}`,
    details: { exitCode: r.code, warnSample: out },
  };
});

finishVerify('verify-static', results);
