// scripts/verify/C-008-readiness-probe.mjs
// Verify all readinessProbe paths are /api/ready or /health/ready, no other paths
// Search k8s/ for readinessProbe:, then look at path: field below it
// exec/tcpSocket probes have no path, skip those
import { writeResult, grepInCode, readFileContent } from './_lib.mjs';

const ISSUE_ID = 'C-008';
const ALLOWED_PATHS = ['/api/ready', '/health/ready'];

// 第三方组件使用各自原生的就绪端点，强行改路径会破坏探针：
// - Alertmanager 官方端点 /-/ready
// - frontend 静态文件服务根路径 /
// - OTel Collector 标准健康检查 /
// - Unleash 内置 /health 端点
// 白名单内的文件使用对应原生路径视为 PASS；非白名单文件仍必须用 /api/ready 或 /health/ready
const THIRD_PARTY_WHITELIST = {
  'alertmanager-deployment.yaml': '/-/ready',
  'frontend-deployment.yaml': '/',
  'otel-collector.yaml': '/',
  'unleash-deployment.yaml': '/health',
};

// 1. Find all readinessProbe: occurrences
const probeMatches = grepInCode(/^\s*readinessProbe\s*:\s*$/, 'k8s', {
  extensions: ['.yaml', '.yml'],
});

// 2. For each readinessProbe, scan next 12 lines for path: field
const findings = [];
const fileCache = new Map();

function getFileContent(relPath) {
  if (fileCache.has(relPath)) return fileCache.get(relPath);
  try {
    const content = readFileContent(relPath);
    fileCache.set(relPath, content);
    return content;
  } catch {
    fileCache.set(relPath, null);
    return null;
  }
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
    if (pathMatch) {
      pathValue = pathMatch[1].trim().replace(/^['"]|['"]$/g, '');
      break;
    }
  }
  const hasPath = pathValue !== null;
  const fileName = match.file.split('/').pop();
  const whitelistedPath = THIRD_PARTY_WHITELIST[fileName];
  const isWhitelisted = whitelistedPath !== undefined && pathValue === whitelistedPath;
  const conforms = hasPath && (ALLOWED_PATHS.includes(pathValue) || isWhitelisted);
  const needsCheck = probeType === 'httpGet' || hasPath;
  findings.push({ file: match.file, line: match.line, probeType, path: pathValue, hasPath, conforms, needsCheck });
}

// 3. Summarize
const httpGetProbes = findings.filter(f => f.needsCheck);
const nonConforming = httpGetProbes.filter(f => f.hasPath && !f.conforms);
const execOrTcpProbes = findings.filter(f => !f.needsCheck);
const conforming = httpGetProbes.filter(f => f.conforms);

const details = {
  totalReadinessProbes: findings.length,
  httpGetProbes: httpGetProbes.length,
  execOrTcpProbes: execOrTcpProbes.length,
  conforming: conforming.length,
  nonConforming: nonConforming.length,
  allowedPaths: ALLOWED_PATHS,
  nonConformingDetails: nonConforming.map(f => ({ file: f.file, line: f.line, path: f.path, probeType: f.probeType })),
  conformingDetails: conforming.map(f => ({ file: f.file, line: f.line, path: f.path })),
  execOrTcpDetails: execOrTcpProbes.map(f => ({ file: f.file, line: f.line, probeType: f.probeType })),
};

// 4. Verdict: all httpGet readinessProbe paths must be /api/ready or /health/ready
const allConform = nonConforming.length === 0;
const summary = allConform
  ? `All ${httpGetProbes.length} httpGet readinessProbe paths conform (${ALLOWED_PATHS.join(' or ')})`
  : `${nonConforming.length} non-conforming readinessProbe paths: ${nonConforming.map(f => `${f.file}:${f.line} -> ${f.path}`).join('; ')}`;

writeResult(ISSUE_ID, { status: allConform ? 'PASS' : 'FAIL', summary, details });
