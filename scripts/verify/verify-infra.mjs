// scripts/verify/verify-infra.mjs
// C-007 (k8s overlays) + C-008 (readiness probe) + C-009 (network policy) + C-010 (metrics) + C-011 (HPA)
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  runCmd,
  fileExists,
  readFileContent,
  grepInCode,
  runCheck,
  finishVerify,
} from './_lib.mjs';

const results = {};

// ── C-007: K8s kustomize overlays ────────────────────────────
await runCheck(results, 'C-007', () => {
  const OVERLAYS = ['dev', 'staging', 'production'];
  const kubectlRes = runCmd('kubectl version --client', { timeout: 15000 });
  if (kubectlRes.code !== 0) return { status: 'SKIP', summary: 'kubectl not installed' };

  const details = {
    overlays: {},
    pathCheck: {},
    kubectlVersion: kubectlRes.out.trim().split('\n')[0],
  };
  let allPass = true;
  for (const env of OVERLAYS) {
    const dir = `k8s/overlays/${env}/`;
    const kExists = fileExists(`${dir}kustomization.yaml`);
    if (!kExists) {
      details.overlays[env] = { kustomizationExists: false, pass: false };
      allPass = false;
      continue;
    }
    const content = readFileContent(`${dir}kustomization.yaml`);
    const baseRef = content.match(/^\s*-\s+(\.\.\/\.\.\/base)([\s/#].*)?$/m);
    const hasTrailingSlash = baseRef ? /\.\.\/\.\.\/base\//.test(baseRef[0]) : false;
    const pathOk = baseRef !== null && !hasTrailingSlash;
    details.pathCheck[env] = { referencesBase: baseRef !== null, hasTrailingSlash, pass: pathOk };
    const flaggedRes = runCmd(`kubectl kustomize --load-restrictor LoadRestrictionsNone ${dir}`, {
      timeout: 60000,
    });
    const buildOk = flaggedRes.code === 0 && flaggedRes.out.split('\n').length > 0;
    details.overlays[env] = { kustomizationExists: true, buildOk, pass: pathOk && buildOk };
    if (!pathOk || !buildOk) allPass = false;
  }
  return {
    status: allPass ? 'PASS' : 'FAIL',
    summary: allPass ? 'All 3 overlays kustomize build OK' : 'Some overlays failed',
    details,
  };
});

// ── C-008: readiness probe ───────────────────────────────────
await runCheck(results, 'C-008', () => {
  const ALLOWED = ['/api/ready', '/health/ready'];
  const WHITELIST = {
    'alertmanager-deployment.yaml': '/-/ready',
    'frontend-deployment.yaml': '/',
    'otel-collector.yaml': '/',
    'unleash-deployment.yaml': '/health',
  };
  const probeMatches = grepInCode(/^\s*readinessProbe\s*:\s*$/, 'k8s', {
    extensions: ['.yaml', '.yml'],
  });
  const findings = [];
  for (const match of probeMatches) {
    const content = readFileContent(match.file);
    const lines = content.split('\n');
    const probeLine = lines[match.line - 1];
    const indent = probeLine.length - probeLine.trimStart().length;
    let pathValue = null,
      probeType = null;
    for (let i = match.line; i < Math.min(lines.length, match.line + 12); i++) {
      const line = lines[i] || '';
      if (
        line.trim() !== '' &&
        !line.trim().startsWith('#') &&
        line.length - line.trimStart().length <= indent
      )
        break;
      const trimmed = line.trim();
      if (/^httpGet\s*:/.test(trimmed)) probeType = 'httpGet';
      else if (/^exec\s*:/.test(trimmed)) probeType = 'exec';
      else if (/^tcpSocket\s*:/.test(trimmed)) probeType = 'tcpSocket';
      const pm = trimmed.match(/^path\s*:\s*(\S.*)$/);
      if (pm) {
        pathValue = pm[1].trim().replace(/^['"]|['"]$/g, '');
        break;
      }
    }
    const fileName = match.file.split('/').pop();
    const isWhitelisted = WHITELIST[fileName] !== undefined && pathValue === WHITELIST[fileName];
    const conforms = pathValue !== null && (ALLOWED.includes(pathValue) || isWhitelisted);
    const needsCheck = probeType === 'httpGet' || pathValue !== null;
    if (needsCheck)
      findings.push({ file: match.file, line: match.line, path: pathValue, conforms });
  }
  const nonConforming = findings.filter((f) => f.path !== null && !f.conforms);
  return {
    status: nonConforming.length === 0 ? 'PASS' : 'FAIL',
    summary:
      nonConforming.length === 0
        ? `All ${findings.length} readinessProbe paths conform`
        : `${nonConforming.length} non-conforming: ${nonConforming.map((f) => `${f.file}:${f.line}`).join('; ')}`,
    details: { total: findings.length, nonConforming },
  };
});

// ── C-009: NetworkPolicy (prometheus ports) ──────────────────
await runCheck(results, 'C-009', () => {
  const ALLOWED_PORTS = [5001, 5003, 5004];
  const FORBIDDEN = 9090;
  let npFiles = [];
  try {
    npFiles = readdirSync(join(process.cwd(), 'k8s/network-policies'))
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .map((f) => `k8s/network-policies/${f}`);
  } catch (e) {
    return { status: 'FAIL', summary: `Cannot read k8s/network-policies: ${e.message}` };
  }

  const policies = [];
  for (const file of npFiles) {
    let content;
    try {
      content = readFileContent(file);
    } catch {
      continue;
    }
    for (const doc of content.split(/^---\s*$/m)) {
      // 仅匹配 prometheus 抓取 Ingress 策略；40-prometheus-dns.yaml 内的 DNS egress（端口 53）不属此检查
      if (
        !doc.trim() ||
        !/^kind:\s*NetworkPolicy\s*$/m.test(doc) ||
        !/name:\s*allow-prometheus-scrape\s*$/m.test(doc)
      )
        continue;
      const ports = [...doc.matchAll(/port:\s*(\d+)/g)].map((m) => parseInt(m[1], 10));
      policies.push({
        file,
        ports,
        hasForbidden: ports.includes(FORBIDDEN),
        allAllowed: ports.length > 0 && ports.every((p) => ALLOWED_PORTS.includes(p)),
      });
    }
  }
  const hasPolicies = policies.length > 0;
  const noForbidden = policies.every((p) => !p.hasForbidden);
  const allAllowed = policies.every((p) => p.allAllowed);
  const pass = hasPolicies && noForbidden && allAllowed;
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: pass
      ? `${policies.length} prometheus NetworkPolicy port(s) all allowed`
      : 'NetworkPolicy check failed',
    details: { policies },
  };
});

// ── C-010: Prometheus metrics ────────────────────────────────
await runCheck(results, 'C-010', () => {
  const EXPECTED = [
    'outbox_unprocessed_count',
    'outbox_oldest_unprocessed_age_seconds',
    'outbox_total_rows',
    'rate_limiter_redis_unavailable_total',
    'ws_connections_active',
  ];
  const registerMatches = grepInCode(
    /registers:\s*\[\s*getPrometheusRegister\(\)\s*\]/,
    'packages/backend/src',
    { extensions: ['.ts'] },
  );
  const foundMetrics = [];
  const fileCache = new Map();
  for (const match of registerMatches) {
    let content = fileCache.get(match.file);
    if (content === undefined) {
      try {
        content = readFileContent(match.file);
        fileCache.set(match.file, content);
      } catch {
        continue;
      }
    }
    const lines = content.split('\n');
    for (let i = match.line - 1; i >= Math.max(0, match.line - 15); i--) {
      const nm = lines[i] && lines[i].match(/^\s*name:\s*['"]([^'"]+)['"]/);
      if (nm) {
        foundMetrics.push(nm[1]);
        break;
      }
    }
  }
  const staticAllFound = EXPECTED.every((m) => foundMetrics.includes(m));
  const missing = EXPECTED.filter((m) => !foundMetrics.includes(m));
  return {
    status: staticAllFound ? 'PASS' : 'FAIL',
    summary: staticAllFound
      ? 'All 5 metrics registered to getPrometheusRegister()'
      : `Missing metrics: ${missing.join(', ')}`,
    details: { foundMetrics, missing },
  };
});

// ── C-011: HPA fields ────────────────────────────────────────
await runCheck(results, 'C-011', () => {
  const wrong = grepInCode(/\bstabilizationScaleDownSeconds\b/, 'k8s', {
    extensions: ['.yaml', '.yml'],
  });
  const right = grepInCode(/\bstabilizationWindowSeconds\b/, 'k8s', {
    extensions: ['.yaml', '.yml'],
  });
  const ok = wrong.length === 0 && right.length > 0;
  return {
    status: ok ? 'PASS' : 'FAIL',
    summary: ok
      ? `HPA fields OK (${right.length} uses of stabilizationWindowSeconds)`
      : `wrong=${wrong.length}, right=${right.length}`,
  };
});

finishVerify('verify-infra', results);
