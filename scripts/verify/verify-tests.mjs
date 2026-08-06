// scripts/verify/verify-tests.mjs
// C-012 (unit tests) + C-013 (coverage gate) + C-014 (go coverage) + H-zod (zod coverage)
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  runCmd,
  fileExists,
  readFileContent,
  runCheck,
  finishVerify,
  PROJECT_ROOT_PATH,
} from './_lib.mjs';

const results = {};
const ANSI_RE = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

// ── C-012: 单元测试验证 ──────────────────────────────────────
await runCheck(results, 'C-012', () => {
  const r = runCmd('npm run test:unit', {
    timeout: 300000,
    env: { FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const output = (r.out + '\n' + r.err).replace(ANSI_RE, '').trim();
  const parseLine = (label) => {
    const m = output.match(new RegExp(`^\\s*${label}\\s+(.+?)\\s*\\((\\d+)\\)\\s*$`, 'm'));
    if (!m) return { failed: 0, passed: 0, skipped: 0, found: false };
    const p = m[1];
    return {
      failed: parseInt(p.match(/(\d+)\s+failed/)?.[1] ?? '0'),
      passed: parseInt(p.match(/(\d+)\s+passed/)?.[1] ?? '0'),
      skipped: parseInt(p.match(/(\d+)\s+skipped/)?.[1] ?? '0'),
      found: true,
    };
  };
  const tests = parseLine('Tests');
  const files = parseLine('Test Files');
  const failedTests = [];
  if (tests.failed > 0 || (r.code !== 0 && !tests.found)) {
    for (const m of output.matchAll(/^\s*×\s+(.+?)(?:\s+\d+ms)?\s*$/gm)) {
      const name = m[1].trim();
      if (name && !name.includes('test.ts') && failedTests.length < 10) failedTests.push(name);
    }
    if (failedTests.length === 0)
      for (const m of output.matchAll(/FAIL\s+(.+?(?:\.test\.[jt]sx?))/g))
        if (failedTests.length < 10) failedTests.push(m[1].trim());
  }
  const pass = r.code === 0 && tests.failed === 0;
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: pass
      ? `单测全部通过: ${tests.passed} passed, 0 failed`
      : r.code !== 0 && !tests.found
        ? `单测运行异常: exit ${r.code}`
        : `单测失败: ${tests.failed} failed / ${tests.passed} passed / ${tests.skipped} skipped`,
    details: {
      exitCode: r.code,
      testsPassed: tests.passed,
      testsFailed: tests.failed,
      filesFailed: files.failed,
      failedTests,
      outputTail: output.slice(-3000),
    },
  };
});

// ── C-013: 覆盖率门控验证 ────────────────────────────────────
await runCheck(results, 'C-013', () => {
  const scriptExists = fileExists('scripts/check-coverage.mjs');
  const src = scriptExists ? readFileContent('scripts/check-coverage.mjs') : '';
  const staticChecks = [
    ['check-coverage.mjs 存在', scriptExists],
    [
      '缺失 coverage-summary.json 时 exit(1)',
      /existsSync/.test(src) &&
        /process\.exit\(1\)/.test(src) &&
        /覆盖率数据缺失|未找到 coverage-summary\.json/.test(src),
    ],
    [
      'JSON 解析失败时 exit(1)',
      /JSON\.parse/.test(src) &&
        /catch/.test(src) &&
        /解析失败/.test(src) &&
        /process\.exit\(1\)/.test(src),
    ],
    [
      '缺少 total 字段时 exit(1)',
      /!total|typeof total/.test(src) &&
        /缺少 total|total 汇总字段/.test(src) &&
        /process\.exit\(1\)/.test(src),
    ],
    [
      '全局门槛检查（≥80%/70%）',
      /GLOBAL_THRESHOLDS/.test(src) &&
        /lines:\s*80/.test(src) &&
        /functions:\s*80/.test(src) &&
        /branches:\s*70/.test(src) &&
        /pct\s*<\s*threshold/.test(src),
    ],
    [
      '失败时 exit(1)',
      /(?:globalFailures|criticalFailures|failures)\.length\s*>\s*0[\s\S]*?process\.exit\(1\)/.test(
        src,
      ),
    ],
    ['通过时 exit(0)', /process\.exit\(0\)/.test(src) && /通过|✅/.test(src)],
  ];
  const checks = staticChecks.map(([name, pass]) => ({ name, pass }));
  let runtimeOk = false;
  if (scriptExists) {
    const r = runCmd('npm run test:coverage:check', {
      timeout: 300000,
      env: { FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    const out = (r.out + '\n' + r.err).replace(ANSI_RE, '').trim();
    runtimeOk = r.code === 0 || r.code === 1;
    const semanticOk =
      r.code === 0
        ? /通过|pass|✅|PASS/i.test(out)
        : /覆盖率|coverage|门槛|threshold|FAIL|✕/i.test(out);
    checks.push({ name: '运行时退出码非崩溃', pass: runtimeOk });
    checks.push({ name: '运行时语义一致', pass: semanticOk });
  } else {
    checks.push({ name: '运行时检查', pass: false });
  }
  const passed = checks.filter((c) => c.pass).length;
  return {
    status: checks.every((c) => c.pass) ? 'PASS' : 'FAIL',
    summary: `覆盖率门控: ${passed}/${checks.length} 项通过`,
    details: { checks },
  };
});

// ── C-014: Go 覆盖率验证 ─────────────────────────────────────
await runCheck(results, 'C-014', () => {
  if (!existsSync(join(PROJECT_ROOT_PATH, 'engine-go')))
    return { status: 'FAIL', summary: 'engine-go 目录不存在' };
  const testR = runCmd('cd engine-go && go test ./... -coverprofile=coverage.out', {
    timeout: 300000,
  });
  if (testR.code !== 0)
    return {
      status: 'FAIL',
      summary: `go test 失败 (exit ${testR.code})`,
      details: { outputTail: (testR.out + testR.err).slice(-2000) },
    };
  const coverR = runCmd('cd engine-go && go tool cover -func=coverage.out');
  if (coverR.code !== 0 || !coverR.out.trim())
    return { status: 'FAIL', summary: `go tool cover 失败` };
  const lines = coverR.out.trim().split('\n');
  const totalCov = parseFloat(lines[lines.length - 1].match(/([\d.]+)%/)?.[1] ?? '0');
  const pkgs = [
    'signal',
    'pca',
    'letf',
    'factorregression',
    'goaloptimizer',
    'mathutil',
    'calculators',
    'engine/tactical',
  ];
  const pkgResults = {};
  for (const pkg of pkgs) {
    const pkgLines = lines.filter((l) => l.includes(`internal/${pkg}/`));
    const pcts = pkgLines.map((l) => parseFloat(l.match(/([\d.]+)%/)?.[1] ?? '0'));
    pkgResults[pkg] =
      pkgLines.length === 0
        ? { found: false }
        : { found: true, max: Math.max(...pcts).toFixed(2), count: pkgLines.length };
  }
  const allHaveCov = Object.values(pkgResults).every((r) => r.found && r.max > 0);
  const pass = totalCov >= 70 && allHaveCov;
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: `Go 覆盖率: ${totalCov}% (>= 70%), 8 包 ${allHaveCov ? '全覆盖' : '部分缺失'}`,
    details: { totalCov, pkgResults },
  };
});

// ── H-zod-coverage: Zod 验证覆盖率 ──────────────────────────
await runCheck(results, 'H-zod-coverage', () => {
  const routesDir = 'packages/backend/src/routes';
  const absDir = join(process.cwd(), routesDir);
  if (!existsSync(absDir)) return { status: 'FAIL', summary: `${routesDir} 不存在` };
  const files = readdirSync(absDir)
    .filter((f) => f.endsWith('.ts') && f !== 'routeUtils.ts')
    .sort();
  const allMissing = [];
  let totalRoutes = 0,
    validatedRoutes = 0;
  const perFile = {};
  for (const f of files) {
    const content = readFileContent(join(routesDir, f));
    const routeRegex = /router\.(post|put|patch)\s*\(/g;
    const missing = [];
    let m;
    while ((m = routeRegex.exec(content)) !== null) {
      const method = m[1].toUpperCase();
      const nextIdx = content.indexOf('router.', m.index + m[0].length);
      const window = content.slice(
        m.index,
        nextIdx > 0 ? nextIdx : Math.min(content.length, m.index + 4000),
      );
      if (!/validate\s*\(/.test(window)) {
        const pm =
          content.slice(m.index).match(/\(\s*(['"`])([^'"`]*?)\1/) ||
          content.slice(m.index).match(/\(\s*([A-Za-z_]\w*)/);
        missing.push({
          method,
          path: pm ? (pm[2] ?? pm[1] ?? '<unknown>') : '<unknown>',
          line: content.slice(0, m.index).split('\n').length,
          file: f,
        });
      }
    }
    const routeCount = (content.match(/router\.(post|put|patch)\s*\(/g) || []).length;
    totalRoutes += routeCount;
    validatedRoutes += routeCount - missing.length;
    perFile[f] = { total: routeCount, missing: missing.length };
    allMissing.push(...missing);
  }
  const ok = allMissing.length === 0;
  const pct = totalRoutes > 0 ? ((validatedRoutes / totalRoutes) * 100).toFixed(1) : '0.0';
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: ok
      ? `all POST/PUT/PATCH have Zod validation (${validatedRoutes}/${totalRoutes})`
      : `${allMissing.length} route(s) missing validation (${validatedRoutes}/${totalRoutes}, ${pct}%)`,
    details: { totalRoutes, validatedRoutes, missingRoutes: allMissing, perFile },
  };
});

finishVerify('verify-tests', results);
