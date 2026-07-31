// scripts/verify/verify-tests.mjs
// 测试质量验证聚合：C-012 (unit tests) + C-013 (coverage gate) + C-014 (go coverage) + H-zod (zod coverage)
// 合并自：C-012-unit-tests.mjs + C-013-coverage-gate.mjs + C-014-go-coverage.mjs + H-zod-coverage.mjs
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCmd, fileExists, readFileContent, runCheck, finishVerify, PROJECT_ROOT_PATH } from './_lib.mjs';

const results = {};

// ── C-012: 单元测试验证 ────────────────────────────────────────
await runCheck(results, 'C-012', () => {
  const r = runCmd('npm run test:unit', { timeout: 300000, env: { FORCE_COLOR: '0', NO_COLOR: '1' } });
  let output = (r.out + '\n' + r.err).trim();
  output = output.replace(/\x1b\[[0-9;]*m/g, '');

  function parseSummaryLine(label) {
    const lineMatch = output.match(new RegExp('^\\s*' + label + '\\s+(.+?)\\s*\\((\\d+)\\)\\s*$', 'm'));
    if (!lineMatch) return { failed: 0, passed: 0, skipped: 0, total: 0, found: false };
    const parts = lineMatch[1];
    const failedMatch = parts.match(/(\d+)\s+failed/);
    const passedMatch = parts.match(/(\d+)\s+passed/);
    const skippedMatch = parts.match(/(\d+)\s+skipped/);
    return { failed: failedMatch ? parseInt(failedMatch[1], 10) : 0, passed: passedMatch ? parseInt(passedMatch[1], 10) : 0, skipped: skippedMatch ? parseInt(skippedMatch[1], 10) : 0, total: parseInt(lineMatch[2]), found: true };
  }

  const tests = parseSummaryLine('Tests');
  const files = parseSummaryLine('Test Files');
  const testsPassed = tests.passed;
  const testsFailed = tests.failed;
  const testsSkipped = tests.skipped;

  const failedTests = [];
  if (testsFailed > 0 || (r.code !== 0 && !tests.found)) {
    const xPattern = /^\s*×\s+(.+?)(?:\s+\d+ms)?\s*$/gm;
    let m;
    while ((m = xPattern.exec(output)) !== null && failedTests.length < 10) {
      const name = m[1].trim();
      if (name && !name.includes('test.ts') && !name.includes('test.tsx')) failedTests.push(name);
    }
    if (failedTests.length === 0) {
      const failPattern = /FAIL\s+(.+?(?:\.test\.[jt]sx?))/g;
      while ((m = failPattern.exec(output)) !== null && failedTests.length < 10) failedTests.push(m[1].trim());
    }
  }

  const isPass = r.code === 0 && testsFailed === 0;
  const isCrash = r.code !== 0 && !tests.found;
  let summary;
  if (isPass) summary = '单测全部通过: ' + testsPassed + ' tests passed, 0 failed';
  else if (isCrash) summary = '单测运行异常: exit code ' + r.code + ', 无法解析测试摘要（runner 可能崩溃）';
  else summary = '单测失败: ' + testsFailed + ' failed / ' + testsPassed + ' passed / ' + testsSkipped + ' skipped (exit code: ' + r.code + ')';

  return {
    status: isPass ? 'PASS' : 'FAIL',
    summary,
    details: { exitCode: r.code, testsPassed, testsFailed, testsSkipped, filesPassed: files.passed, filesFailed: files.failed, failedTests: failedTests.slice(0, 10), outputTail: output.slice(-3000) },
  };
});

// ── C-013: 覆盖率门控脚本行为验证 ──────────────────────────────
await runCheck(results, 'C-013', () => {
  const checks = [];
  const scriptExists = fileExists('scripts/check-coverage.mjs');
  checks.push({ name: 'check-coverage.mjs 存在', pass: scriptExists, detail: scriptExists ? 'scripts/check-coverage.mjs 已找到' : 'scripts/check-coverage.mjs 不存在' });
  let src = '';
  if (scriptExists) src = readFileContent('scripts/check-coverage.mjs');

  const hasMissingFileHandling = /existsSync/.test(src) && /process\.exit\(1\)/.test(src) && /覆盖率数据缺失|未找到 coverage-summary\.json/.test(src);
  checks.push({ name: '静态：缺失 coverage-summary.json 时 exit(1) + 错误信息', pass: hasMissingFileHandling, detail: hasMissingFileHandling ? '检测到 existsSync 检查 + process.exit(1) + 缺失提示信息' : '未检测到完整的缺失文件处理逻辑' });

  const hasJsonParseHandling = /JSON\.parse/.test(src) && /catch/.test(src) && /解析失败/.test(src) && /process\.exit\(1\)/.test(src);
  checks.push({ name: '静态：JSON 解析失败时 exit(1) + 错误信息', pass: hasJsonParseHandling, detail: hasJsonParseHandling ? '检测到 JSON.parse + try/catch + exit(1) + 解析失败提示' : '未检测到完整的 JSON 解析错误处理逻辑' });

  const hasMissingTotalHandling = /!total|typeof total/.test(src) && /缺少 total|total 汇总字段/.test(src) && /process\.exit\(1\)/.test(src);
  checks.push({ name: '静态：缺少 total 字段时 exit(1) + 错误信息', pass: hasMissingTotalHandling, detail: hasMissingTotalHandling ? '检测到 !total / typeof total 检查 + exit(1) + 提示信息' : '未检测到完整的 total 字段缺失处理逻辑' });

  const hasThresholdLogic = /GLOBAL_THRESHOLDS/.test(src) && /lines:\s*80/.test(src) && /functions:\s*80/.test(src) && /statements:\s*80/.test(src) && /branches:\s*70/.test(src) && /pct\s*<\s*threshold/.test(src);
  checks.push({ name: '静态：全局门槛检查逻辑（lines/functions/statements ≥80%, branches ≥70%）', pass: hasThresholdLogic, detail: hasThresholdLogic ? '检测到 GLOBAL_THRESHOLDS 定义 + 各指标阈值 + pct 与 threshold 比较' : '未检测到完整的门槛检查逻辑' });

  const hasFailureExit = /globalFailures\.length\s*>\s*0[\s\S]*?process\.exit\(1\)/.test(src) || /criticalFailures\.length\s*>\s*0[\s\S]*?process\.exit\(1\)/.test(src) || /failures\.length\s*>\s*0[\s\S]*?process\.exit\(1\)/.test(src);
  checks.push({ name: '静态：失败时 exit(1)', pass: hasFailureExit, detail: hasFailureExit ? '检测到 failures 数组非空时 process.exit(1)' : '未检测到失败退出逻辑' });

  const hasSuccessExit = /process\.exit\(0\)/.test(src) && /通过|✅/.test(src);
  checks.push({ name: '静态：通过时 exit(0)', pass: hasSuccessExit, detail: hasSuccessExit ? '检测到 process.exit(0) + 通过提示' : '未检测到成功退出逻辑' });

  let runtimeExitOk = false, runtimeOutputSemanticOk = false, runtimeDetail = '', runtimeExitCode = null;
  if (scriptExists) {
    const r = runCmd('npm run test:coverage:check', { timeout: 300000, env: { FORCE_COLOR: '0', NO_COLOR: '1' } });
    const output = (r.out + '\n' + r.err).replace(/\x1b\[[0-9;]*m/g, '').trim();
    runtimeExitCode = r.code;
    runtimeExitOk = r.code === 0 || r.code === 1;
    if (r.code === 1) {
      const coverageFailureKeywords = /覆盖率|coverage|门槛|threshold|未达标|拒绝合并|❌|缺失|不达标/i.test(output);
      const metricWithPercent = /(lines|functions|branches|statements)[^%]*%/i.test(output);
      const testFailureKeywords = /FAIL\b|✕|✗|✘|tests?\s+failed|test\s+failures?|Test\s+Files\s+\d+\s+failed|Tests\s+\d+\s+failed|AssertionError|Expected\s+received/i.test(output);
      runtimeOutputSemanticOk = coverageFailureKeywords || metricWithPercent || testFailureKeywords;
      runtimeDetail = `exit=${r.code}（预期失败），输出包含${coverageFailureKeywords || metricWithPercent ? '覆盖率失败' : testFailureKeywords ? '测试失败（覆盖率数据未生成）' : '未知'}语义`;
    } else if (r.code === 0) {
      runtimeOutputSemanticOk = /通过|pass|✅|PASS/i.test(output);
      runtimeDetail = `exit=${r.code}（通过），输出包含${runtimeOutputSemanticOk ? '通过' : '未知'}语义`;
    } else {
      runtimeOutputSemanticOk = false;
      runtimeDetail = `exit=${r.code}（非预期的崩溃/超时）`;
    }
    checks.push({ name: '运行时：npm run test:coverage:check 退出码为 0 或 1（非崩溃）', pass: runtimeExitOk, detail: `实际 exit code = ${r.code}` });
    checks.push({ name: '运行时：输出语义与退出码一致', pass: runtimeOutputSemanticOk, detail: runtimeDetail });
  } else {
    checks.push({ name: '运行时：npm run test:coverage:check 退出码为 0 或 1（非崩溃）', pass: false, detail: '脚本不存在，跳过运行时检查' });
    checks.push({ name: '运行时：输出语义与退出码一致', pass: false, detail: '脚本不存在，跳过运行时检查' });
  }

  const allPass = checks.every((c) => c.pass);
  const passedCount = checks.filter((c) => c.pass).length;
  return {
    status: allPass ? 'PASS' : 'FAIL',
    summary: allPass ? `覆盖率门控脚本行为验证通过（${passedCount}/${checks.length} 项检查通过）` : `覆盖率门控脚本行为验证失败（${passedCount}/${checks.length} 项通过）`,
    details: { checks, scriptExists, runtimeExitCode, verifiedBehaviors: ['缺失 coverage-summary.json 时 exit(1)', 'JSON 解析失败时 exit(1)', '缺少 total 字段时 exit(1)', '全局门槛检查（lines/functions/statements ≥80%, branches ≥70%）', '失败时 exit(1) / 通过时 exit(0)', '运行时退出码非崩溃且语义一致'] },
  };
});

// ── C-014: Go 覆盖率验证 ───────────────────────────────────────
await runCheck(results, 'C-014', () => {
  const engineDir = join(PROJECT_ROOT_PATH, 'engine-go');
  if (!existsSync(engineDir)) {
    return { status: 'FAIL', summary: 'engine-go 目录不存在' };
  }
  const testR = runCmd('cd engine-go && go test ./... -coverprofile=coverage.out', { timeout: 300000 });
  const testOutput = (testR.out + '\n' + testR.err).trim();
  if (testR.code !== 0) {
    return { status: 'FAIL', summary: `go test 失败 (exit code ${testR.code})`, details: { exitCode: testR.code, outputTail: testOutput.slice(-2000) } };
  }
  const coverR = runCmd('cd engine-go && go tool cover -func=coverage.out');
  const coverOutput = coverR.out.trim();
  if (coverR.code !== 0 || !coverOutput) {
    return { status: 'FAIL', summary: `go tool cover 执行失败 (exit code ${coverR.code})`, details: { err: coverR.err, out: coverR.out.slice(-500) } };
  }
  const lines = coverOutput.split('\n');
  const totalLine = lines[lines.length - 1];
  const totalMatch = totalLine.match(/([\d.]+)%/);
  const totalCoverage = totalMatch ? parseFloat(totalMatch[1]) : 0;
  const targetPkgs = ['signal', 'pca', 'letf', 'factorregression', 'goaloptimizer', 'mathutil', 'calculators', 'engine/tactical'];
  const pkgResults = {};
  for (const pkg of targetPkgs) {
    const pkgLines = lines.filter((l) => l.includes(`internal/${pkg}/`));
    if (pkgLines.length === 0) {
      pkgResults[pkg] = { found: false, maxCoverage: 0, note: '未在覆盖率报告中找到' };
    } else {
      const pcts = pkgLines.map((l) => { const m = l.match(/([\d.]+)%/); return m ? parseFloat(m[1]) : 0; });
      pkgResults[pkg] = { found: true, maxCoverage: parseFloat(Math.max(...pcts).toFixed(2)), avgCoverage: parseFloat((pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(2)), functionCount: pkgLines.length };
    }
  }
  const allPkgsHaveCoverage = Object.values(pkgResults).every((r) => r.found && r.maxCoverage > 0);
  const totalPass = totalCoverage >= 70;
  const isPass = totalPass && allPkgsHaveCoverage;
  return {
    status: isPass ? 'PASS' : 'FAIL',
    summary: isPass ? `Go 覆盖率达标: 总覆盖率 ${totalCoverage}% (>= 70%), 8 个目标包均有覆盖` : `Go 覆盖率未达标: 总覆盖率 ${totalCoverage}% (需 >= 70%), ${allPkgsHaveCoverage ? '8 个目标包均有覆盖' : '部分目标包无覆盖'}`,
    details: { totalCoverage, totalPass, targetPackages: pkgResults, testExitCode: testR.code, totalLine },
  };
});

// ── H-zod-coverage: Zod 验证覆盖率 ─────────────────────────────
await runCheck(results, 'H-zod-coverage', () => {
  const HZOD_ROUTES_REL_DIR = 'packages/backend/src/routes';
  const HZOD_ROUTES_ABS_DIR = join(process.cwd(), HZOD_ROUTES_REL_DIR);
  const HZOD_NON_ROUTE_FILES = new Set(['routeUtils.ts']);

  function listRouteFiles() {
    if (!existsSync(HZOD_ROUTES_ABS_DIR)) return [];
    return readdirSync(HZOD_ROUTES_ABS_DIR).filter((f) => f.endsWith('.ts') && !HZOD_NON_ROUTE_FILES.has(f)).sort();
  }
  function extractPath(content, callStart) {
    const afterParen = content.slice(callStart);
    const m = afterParen.match(/\(\s*(['"`])([^'"`]*?)\1/) || afterParen.match(/\(\s*([A-Za-z_]\w*)/);
    return m ? (m[2] ?? m[1] ?? '<unknown>') : '<unknown>';
  }
  function findUnvalidatedRoutes(fileName) {
    const content = readFileContent(join(HZOD_ROUTES_REL_DIR, fileName));
    const routeRegex = /router\.(post|put|patch)\s*\(/g;
    const missing = [];
    let m;
    while ((m = routeRegex.exec(content)) !== null) {
      const method = m[1].toUpperCase();
      const callStart = m.index;
      const nextRouterIdx = content.indexOf('router.', callStart + m[0].length);
      const windowEnd = nextRouterIdx > 0 ? nextRouterIdx : Math.min(content.length, callStart + 4000);
      const window = content.slice(callStart, windowEnd);
      if (!/validate\s*\(/.test(window)) {
        const path = extractPath(content, callStart);
        const line = content.slice(0, callStart).split('\n').length;
        missing.push({ method, path, line, file: fileName });
      }
    }
    return missing;
  }

  const files = listRouteFiles();
  if (files.length === 0) {
    return { status: 'FAIL', summary: `routes 目录为空或不存在: ${HZOD_ROUTES_REL_DIR}`, details: { routesDir: HZOD_ROUTES_REL_DIR, fileCount: 0 } };
  }
  const allMissing = [];
  const perFile = {};
  let totalRoutes = 0, validatedRoutes = 0;
  for (const f of files) {
    const missing = findUnvalidatedRoutes(f);
    const content = readFileContent(join(HZOD_ROUTES_REL_DIR, f));
    const routeCount = (content.match(/router\.(post|put|patch)\s*\(/g) || []).length;
    totalRoutes += routeCount;
    validatedRoutes += routeCount - missing.length;
    perFile[f] = { total: routeCount, missing: missing.length, missingRoutes: missing };
    allMissing.push(...missing);
  }
  const allValidated = allMissing.length === 0;
  const coveragePct = totalRoutes > 0 ? ((validatedRoutes / totalRoutes) * 100).toFixed(1) : '0.0';
  return {
    status: allValidated ? 'PASS' : 'FAIL',
    summary: allValidated ? `all POST/PUT/PATCH have Zod validation (${validatedRoutes}/${totalRoutes} routes, ${coveragePct}%)` : `${allMissing.length} POST/PUT/PATCH route(s) missing Zod validation (${validatedRoutes}/${totalRoutes} validated, ${coveragePct}%)`,
    details: { routesDir: HZOD_ROUTES_REL_DIR, filesScanned: files.length, totalRoutes, validatedRoutes, missingCount: allMissing.length, coveragePct: `${coveragePct}%`, missingRoutes: allMissing, perFile },
  };
});

finishVerify('verify-tests', results);
