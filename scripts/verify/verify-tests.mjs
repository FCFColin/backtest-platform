import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCmd, readFileContent, runCheck, finishVerify, PROJECT_ROOT_PATH } from './_lib.mjs';

const results = {};

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
  const dfR = runCmd('cd data-fetcher && go test ./...', { timeout: 300000 });
  if (dfR.code !== 0)
    return {
      status: 'FAIL',
      summary: `data-fetcher go test 失败 (exit ${dfR.code})`,
      details: { outputTail: (dfR.out + dfR.err).slice(-2000) },
    };
  const coverR = runCmd('cd engine-go && go tool cover -func=coverage.out');
  if (coverR.code !== 0 || !coverR.out.trim())
    return { status: 'FAIL', summary: `go tool cover 失败` };
  const lines = coverR.out.trim().split('\n');
  const totalCov = parseFloat(lines[lines.length - 1].match(/([\d.]+)%/)?.[1] ?? '0');
  const pkgs = [
    'signal',
    'analysis',
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
        const usesBody = /req\.body/.test(window);
        const pm =
          content.slice(m.index).match(/\(\s*(['"`])([^'"`]*?)\1/) ||
          content.slice(m.index).match(/\(\s*([A-Za-z_]\w*)/);
        if (usesBody) {
          missing.push({
            method,
            path: pm ? (pm[2] ?? pm[1] ?? '<unknown>') : '<unknown>',
            line: content.slice(0, m.index).split('\n').length,
            file: f,
          });
        }
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
