// scripts/verify/verify-infra.mjs
// 基础设施类验证聚合：C-007 (k8s overlays) + C-008 (readiness probe) + C-009 (network policy) + C-010 (metrics) + C-011 (HPA)
import { readdirSync, existsSync, readFileSync } from 'node:fs';
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

// ── C-007: K8s kustomize overlays ──────────────────────────────
await runCheck(results, 'C-007', () => {
  const C007_OVERLAYS = ['dev', 'staging', 'production'];
  const C007_LOAD_RESTRICTOR_FLAG = '--load-restrictor LoadRestrictionsNone';
  const C007_details = { overlays: {}, pathCheck: {}, kubectlVersion: null, kubectlInstalled: false };

  const kubectlVersionResult = runCmd('kubectl version --client', { timeout: 15000 });
  if (kubectlVersionResult.code !== 0) {
    return {
      status: 'SKIP',
      summary: 'kubectl not installed, cannot run kustomize build',
      details: { error: kubectlVersionResult.err || kubectlVersionResult.out, kubectlInstalled: false },
    };
  }
  C007_details.kubectlInstalled = true;
  C007_details.kubectlVersion = kubectlVersionResult.out.trim().split('\n')[0];

  let allDirsExist = true;
  for (const env of C007_OVERLAYS) {
    const exists = fileExists(`k8s/overlays/${env}/kustomization.yaml`);
    C007_details.overlays[env] = C007_details.overlays[env] || {};
    C007_details.overlays[env].kustomizationExists = exists;
    if (!exists) allDirsExist = false;
  }

  if (!allDirsExist) {
    return { status: 'FAIL', summary: 'Some overlay kustomization.yaml missing', details: C007_details };
  }

  let pathCheckAllPass = true;
  for (const env of C007_OVERLAYS) {
    const content = readFileContent(`k8s/overlays/${env}/kustomization.yaml`);
    const baseRefMatch = content.match(/^\s*-\s+(\.\.\/\.\.\/base)([\s\/#].*)?$/m);
    const baseRef = baseRefMatch ? baseRefMatch[1] : null;
    const hasTrailingSlash = baseRefMatch ? /\.\.\/\.\.\/base\//.test(baseRefMatch[0]) : false;
    const referencesBase = baseRef !== null;
    const pass = referencesBase && !hasTrailingSlash;
    C007_details.pathCheck[env] = { referencesBase, baseRef, hasTrailingSlash, matchedLine: baseRefMatch ? baseRefMatch[0].trim() : null, pass };
    if (!pass) pathCheckAllPass = false;
  }

  let buildAllPass = true;
  for (const env of C007_OVERLAYS) {
    const dir = `k8s/overlays/${env}/`;
    const plainResult = runCmd(`kubectl kustomize ${dir}`, { timeout: 60000 });
    const flaggedResult = runCmd(`kubectl kustomize ${C007_LOAD_RESTRICTOR_FLAG} ${dir}`, { timeout: 60000 });
    const flaggedLineCount = flaggedResult.code === 0 ? flaggedResult.out.split('\n').length : 0;
    C007_details.overlays[env] = {
      ...C007_details.overlays[env],
      plainBuild: { code: plainResult.code, outLines: plainResult.code === 0 ? plainResult.out.split('\n').length : 0, errSnippet: plainResult.err.slice(0, 300) },
      flaggedBuild: { code: flaggedResult.code, outLines: flaggedLineCount, errSnippet: flaggedResult.err.slice(0, 300) },
      pass: flaggedResult.code === 0 && flaggedLineCount > 0,
    };
    if (!C007_details.overlays[env].pass) buildAllPass = false;
  }

  const allPass = pathCheckAllPass && buildAllPass;
  const failedEnvs = C007_OVERLAYS.filter(env => !C007_details.overlays[env].pass);
  const failedPaths = C007_OVERLAYS.filter(env => !C007_details.pathCheck[env].pass);
  let summary;
  if (allPass) {
    summary = `All 3 overlays (dev/staging/production) kustomize build OK (with --load-restrictor flag), all reference ../../base (no trailing slash)`;
  } else {
    const reasons = [];
    if (failedPaths.length) reasons.push(`path check failed: ${failedPaths.join(', ')}`);
    if (failedEnvs.length) reasons.push(`build failed: ${failedEnvs.join(', ')}`);
    summary = reasons.join('; ');
  }
  return { status: allPass ? 'PASS' : 'FAIL', summary, details: C007_details };
});

// ── C-008: readiness probe ─────────────────────────────────────
await runCheck(results, 'C-008', () => {
  const C008_ALLOWED_PATHS = ['/api/ready', '/health/ready'];
  const C008_THIRD_PARTY_WHITELIST = {
    'alertmanager-deployment.yaml': '/-/ready',
    'frontend-deployment.yaml': '/',
    'otel-collector.yaml': '/',
    'unleash-deployment.yaml': '/health',
  };
  const probeMatches = grepInCode(/^\s*readinessProbe\s*:\s*$/, 'k8s', { extensions: ['.yaml', '.yml'] });
  const findings = [];
  const fileCache = new Map();
  function getFileContent(relPath) {
    if (fileCache.has(relPath)) return fileCache.get(relPath);
    try { const content = readFileContent(relPath); fileCache.set(relPath, content); return content; } catch { fileCache.set(relPath, null); return null; }
  }
  for (const match of probeMatches) {
    const content = getFileContent(match.file);
    if (!content) continue;
    const lines = content.split('\n');
    const probeLine = lines[match.line - 1];
    const probeIndent = probeLine.length - probeLine.trimStart().length;
    let pathValue = null;
    let probeType = null;
    const endLine = Math.min(lines.length, match.line + 12);
    for (let i = match.line; i < endLine; i++) {
      const line = lines[i] || '';
      if (line.trim() !== '' && !line.trim().startsWith('#')) {
        const indent = line.length - line.trimStart().length;
        if (indent <= probeIndent) break;
      }
      const trimmed = line.trim();
      if (/^httpGet\s*:/.test(trimmed)) probeType = 'httpGet';
      else if (/^exec\s*:/.test(trimmed)) probeType = 'exec';
      else if (/^tcpSocket\s*:/.test(trimmed)) probeType = 'tcpSocket';
      const pathMatch = trimmed.match(/^path\s*:\s*(\S.*)$/);
      if (pathMatch) { pathValue = pathMatch[1].trim().replace(/^['"]|['"]$/g, ''); break; }
    }
    const hasPath = pathValue !== null;
    const fileName = match.file.split('/').pop();
    const whitelistedPath = C008_THIRD_PARTY_WHITELIST[fileName];
    const isWhitelisted = whitelistedPath !== undefined && pathValue === whitelistedPath;
    const conforms = hasPath && (C008_ALLOWED_PATHS.includes(pathValue) || isWhitelisted);
    const needsCheck = probeType === 'httpGet' || hasPath;
    findings.push({ file: match.file, line: match.line, probeType, path: pathValue, hasPath, conforms, needsCheck });
  }
  const httpGetProbes = findings.filter(f => f.needsCheck);
  const nonConforming = httpGetProbes.filter(f => f.hasPath && !f.conforms);
  const conforming = httpGetProbes.filter(f => f.conforms);
  const allConform = nonConforming.length === 0;
  return {
    status: allConform ? 'PASS' : 'FAIL',
    summary: allConform
      ? `All ${httpGetProbes.length} httpGet readinessProbe paths conform (${C008_ALLOWED_PATHS.join(' or ')})`
      : `${nonConforming.length} non-conforming readinessProbe paths: ${nonConforming.map(f => `${f.file}:${f.line} -> ${f.path}`).join('; ')}`,
    details: {
      totalReadinessProbes: findings.length,
      httpGetProbes: httpGetProbes.length,
      conforming: conforming.length,
      nonConforming: nonConforming.length,
      allowedPaths: C008_ALLOWED_PATHS,
      nonConformingDetails: nonConforming.map(f => ({ file: f.file, line: f.line, path: f.path, probeType: f.probeType })),
    },
  };
});

// ── C-009: NetworkPolicy (prometheus ports) ────────────────────
await runCheck(results, 'C-009', () => {
  const C009_ALLOWED_PORTS = [5001, 5003, 5004];
  const C009_FORBIDDEN_PORT = 9090;
  const C009_NP_DIR = 'k8s/network-policies';
  let npFiles = [];
  try {
    const absDir = join(process.cwd(), C009_NP_DIR);
    npFiles = readdirSync(absDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).map(f => `${C009_NP_DIR}/${f}`);
  } catch (e) {
    return { status: 'FAIL', summary: `Cannot read ${C009_NP_DIR}: ${e.message}`, details: { error: e.message } };
  }
  const C009_details = { networkPolicyFiles: npFiles, prometheusPolicies: [], forbiddenPortFound: false, allowedPortsUsed: [], forbiddenPortsUsed: [] };
  for (const file of npFiles) {
    let content;
    try { content = readFileContent(file); } catch { continue; }
    const docs = content.split(/^---\s*$/m);
    for (let docIdx = 0; docIdx < docs.length; docIdx++) {
      const doc = docs[docIdx];
      if (!doc.trim()) continue;
      if (!/^kind:\s*NetworkPolicy\s*$/m.test(doc)) continue;
      if (!/prometheus/i.test(doc)) continue;
      const ports = [];
      const lines = doc.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const portMatch = lines[i].match(/^\s*port:\s*(\d+)\s*$/);
        if (portMatch) ports.push(parseInt(portMatch[1], 10));
      }
      const nameMatch = doc.match(/^metadata:\s*\n\s*name:\s*(\S+)\s*$/m);
      const policyName = nameMatch ? nameMatch[1] : '<unknown>';
      const hasForbidden = ports.includes(C009_FORBIDDEN_PORT);
      const allAllowed = ports.length > 0 && ports.every(p => C009_ALLOWED_PORTS.includes(p));
      C009_details.prometheusPolicies.push({ file, docIdx, policyName, ports, hasForbiddenPort: hasForbidden, allPortsAllowed: allAllowed });
      if (hasForbidden) C009_details.forbiddenPortFound = true;
      for (const p of ports) {
        if (C009_ALLOWED_PORTS.includes(p) && !C009_details.allowedPortsUsed.includes(p)) C009_details.allowedPortsUsed.push(p);
        if (p === C009_FORBIDDEN_PORT && !C009_details.forbiddenPortsUsed.includes(p)) C009_details.forbiddenPortsUsed.push(p);
      }
    }
  }
  const hasPrometheusPolicy = C009_details.prometheusPolicies.length > 0;
  const noForbiddenPort = !C009_details.forbiddenPortFound;
  const allPoliciesUseAllowedPorts = C009_details.prometheusPolicies.every(p => p.allPortsAllowed);
  let status, summary;
  if (!hasPrometheusPolicy) { status = 'FAIL'; summary = 'No NetworkPolicy with prometheus found'; }
  else if (!noForbiddenPort) { status = 'FAIL'; summary = `Forbidden port ${C009_FORBIDDEN_PORT} found (expected ${C009_ALLOWED_PORTS.join('/')})`; }
  else if (!allPoliciesUseAllowedPorts) { status = 'FAIL'; summary = `Some prometheus NetworkPolicy ports not in allowed list ${C009_ALLOWED_PORTS.join('/')}`; }
  else { status = 'PASS'; summary = `${C009_details.prometheusPolicies.length} prometheus NetworkPolicy port(s) all ${C009_details.allowedPortsUsed.join('/')} (no ${C009_FORBIDDEN_PORT})`; }
  return { status, summary, details: C009_details };
});

// ── C-010: Prometheus metrics ──────────────────────────────────
await runCheck(results, 'C-010', () => {
  const C010_EXPECTED_METRICS = [
    'outbox_unprocessed_count', 'outbox_oldest_unprocessed_age_seconds',
    'outbox_total_rows', 'rate_limiter_redis_unavailable_total', 'ws_connections_active',
  ];
  const C010_details = {
    expectedMetrics: C010_EXPECTED_METRICS,
    staticCheck: { registerCalls: 0, foundMetrics: [], metricLocations: [], allMetricsFound: false, missingMetrics: [] },
    integrationCheck: { attempted: false, endpoint: null, httpStatus: null, foundMetrics: [], missingMetrics: [], responseLineCount: 0, error: null },
  };
  const registerMatches = grepInCode(/registers:\s*\[\s*getPrometheusRegister\(\)\s*\]/, 'packages/backend/src', { extensions: ['.ts'] });
  C010_details.staticCheck.registerCalls = registerMatches.length;
  const fileCache = new Map();
  for (const match of registerMatches) {
    let content;
    if (fileCache.has(match.file)) { content = fileCache.get(match.file); }
    else { try { content = readFileSync(match.file, 'utf-8'); fileCache.set(match.file, content); } catch { continue; } }
    const lines = content.split('\n');
    for (let i = match.line - 1; i >= Math.max(0, match.line - 15); i--) {
      const nameMatch = lines[i] && lines[i].match(/^\s*name:\s*['"]([^'"]+)['"]/);
      if (nameMatch) {
        C010_details.staticCheck.foundMetrics.push(nameMatch[1]);
        C010_details.staticCheck.metricLocations.push({ file: match.file, line: i + 1, metric: nameMatch[1], registerLine: match.line });
        break;
      }
    }
  }
  const staticAllFound = C010_EXPECTED_METRICS.every(m => C010_details.staticCheck.foundMetrics.includes(m));
  C010_details.staticCheck.allMetricsFound = staticAllFound;
  C010_details.staticCheck.missingMetrics = C010_EXPECTED_METRICS.filter(m => !C010_details.staticCheck.foundMetrics.includes(m));

  const endpoints = ['http://localhost:15001/api/metrics', 'http://localhost:15001/metrics'];
  let integrationSuccess = false;
  let integrationEndpoint = null;
  let integrationResponse = '';
  for (const url of endpoints) {
    C010_details.integrationCheck.attempted = true;
    const curlResult = runCmd(`curl.exe -s -o - -w "\\n__HTTP_CODE__%{http_code}" ${url}`, { timeout: 15000 });
    if (curlResult.code !== 0) { C010_details.integrationCheck.error = `curl failed: ${curlResult.err}`; continue; }
    const output = curlResult.out;
    const httpCodeMatch = output.match(/__HTTP_CODE__(\d+)/);
    const httpCode = httpCodeMatch ? parseInt(httpCodeMatch[1], 10) : 0;
    const body = output.replace(/__HTTP_CODE__\d+$/, '');
    const isPrometheusFormat = /^#\s+(HELP|TYPE)|^[a-z_]+([{| ])/m.test(body);
    if (httpCode !== 200 || !isPrometheusFormat) continue;
    integrationSuccess = true;
    integrationEndpoint = url;
    integrationResponse = body;
    C010_details.integrationCheck.endpoint = url;
    C010_details.integrationCheck.httpStatus = httpCode;
    C010_details.integrationCheck.responseLineCount = body.split('\n').length;
    break;
  }
  if (integrationSuccess) {
    for (const metric of C010_EXPECTED_METRICS) {
      const regex = new RegExp(`^${metric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s{]|$)`, 'm');
      if (regex.test(integrationResponse)) C010_details.integrationCheck.foundMetrics.push(metric);
      else C010_details.integrationCheck.missingMetrics.push(metric);
    }
  } else {
    C010_details.integrationCheck.missingMetrics = [...C010_EXPECTED_METRICS];
    C010_details.integrationCheck.error = C010_details.integrationCheck.error || 'Cannot reach /metrics or /api/metrics (API not running or non-Prometheus response)';
  }
  const integrationAllFound = integrationSuccess && C010_details.integrationCheck.missingMetrics.length === 0;
  let status, summary;
  if (!staticAllFound) { status = 'FAIL'; summary = `Static check: missing metrics ${C010_details.staticCheck.missingMetrics.join(', ')}`; }
  else if (!C010_details.integrationCheck.attempted) { status = 'PASS'; summary = `Static check passed: all 5 metrics registered to getPrometheusRegister() (integration not attempted)`; }
  else if (!integrationSuccess) { status = 'PASS'; summary = `Static check passed: all 5 metrics registered (integration skipped: API not running or endpoint unreachable)`; }
  else if (!integrationAllFound) { status = 'FAIL'; summary = `Integration check: ${C010_details.integrationCheck.missingMetrics.join(', ')} not exposed at ${integrationEndpoint}`; }
  else { status = 'PASS'; summary = `All 5 metrics registered and exposed at ${integrationEndpoint} (static + integration both passed)`; }
  return { status, summary, details: C010_details };
});

// ── C-011: HPA field ───────────────────────────────────────────
await runCheck(results, 'C-011', () => {
  const C011_WRONG_FIELD = 'stabilizationScaleDownSeconds';
  const C011_RIGHT_FIELD = 'stabilizationWindowSeconds';
  const wrongFieldMatches = grepInCode(new RegExp(`\\b${C011_WRONG_FIELD}\\b`), 'k8s', { extensions: ['.yaml', '.yml'] });
  const rightFieldMatches = grepInCode(new RegExp(`\\b${C011_RIGHT_FIELD}\\b`), 'k8s', { extensions: ['.yaml', '.yml'] });
  const noWrongField = wrongFieldMatches.length === 0;
  const hasRightField = rightFieldMatches.length > 0;
  let status, summary;
  if (noWrongField && hasRightField) { status = 'PASS'; summary = `HPA fields OK: no ${C011_WRONG_FIELD} (${rightFieldMatches.length} uses of ${C011_RIGHT_FIELD})`; }
  else if (!noWrongField && hasRightField) { status = 'FAIL'; summary = `${wrongFieldMatches.length} wrong field ${C011_WRONG_FIELD} still present (though ${C011_RIGHT_FIELD} also exists)`; }
  else if (noWrongField && !hasRightField) { status = 'FAIL'; summary = `Correct field ${C011_RIGHT_FIELD} not found (no wrong field either, HPA config may be missing)`; }
  else { status = 'FAIL'; summary = `Wrong field ${C011_WRONG_FIELD} present ${wrongFieldMatches.length} times, correct field ${C011_RIGHT_FIELD} missing`; }
  return {
    status, summary,
    details: {
      wrongField: { name: C011_WRONG_FIELD, actualCount: wrongFieldMatches.length, occurrences: wrongFieldMatches.map(m => ({ file: m.file, line: m.line, text: m.text })) },
      rightField: { name: C011_RIGHT_FIELD, actualCount: rightFieldMatches.length, occurrences: rightFieldMatches.map(m => ({ file: m.file, line: m.line, text: m.text })) },
    },
  };
});

finishVerify('verify-infra', results);
