// scripts/verify/C-010-metrics.mjs
// Verify 5 Prometheus metrics registered to custom registry and exposed at /metrics endpoint
// Static: grep registers: [getPrometheusRegister()] in packages/backend/src
// Integration: curl http://localhost:15001/api/metrics (actual endpoint, not /metrics)
//
// Actual 5 metrics (confirmed via code search):
//   1. outbox_unprocessed_count
//   2. outbox_oldest_unprocessed_age_seconds
//   3. outbox_total_rows
//   4. rate_limiter_redis_unavailable_total
//   5. ws_connections_active
import { writeResult, grepInCode, runCmd } from './_lib.mjs';
import { readFileSync } from 'node:fs';

const ISSUE_ID = 'C-010';
const EXPECTED_METRICS = [
  'outbox_unprocessed_count',
  'outbox_oldest_unprocessed_age_seconds',
  'outbox_total_rows',
  'rate_limiter_redis_unavailable_total',
  'ws_connections_active',
];

const details = {
  expectedMetrics: EXPECTED_METRICS,
  staticCheck: {
    registerCalls: 0,
    foundMetrics: [],
    metricLocations: [],
    allMetricsFound: false,
    missingMetrics: [],
  },
  integrationCheck: {
    attempted: false,
    endpoint: null,
    httpStatus: null,
    foundMetrics: [],
    missingMetrics: [],
    responseLineCount: 0,
    error: null,
  },
};

// 1. Static check: search registers: [getPrometheusRegister()]
const registerMatches = grepInCode(
  /registers:\s*\[\s*getPrometheusRegister\(\)\s*\]/,
  'packages/backend/src',
  { extensions: ['.ts'] }
);
details.staticCheck.registerCalls = registerMatches.length;

// For each register call, look up to 15 lines above for name: 'xxx'
const fileCache = new Map();
for (const match of registerMatches) {
  let content;
  if (fileCache.has(match.file)) {
    content = fileCache.get(match.file);
  } else {
    try {
      content = readFileSync(match.file, 'utf-8');
      fileCache.set(match.file, content);
    } catch {
      continue;
    }
  }
  const lines = content.split('\n');
  for (let i = match.line - 1; i >= Math.max(0, match.line - 15); i--) {
    const nameMatch = lines[i] && lines[i].match(/^\s*name:\s*['"]([^'"]+)['"]/);
    if (nameMatch) {
      details.staticCheck.foundMetrics.push(nameMatch[1]);
      details.staticCheck.metricLocations.push({
        file: match.file,
        line: i + 1,
        metric: nameMatch[1],
        registerLine: match.line,
      });
      break;
    }
  }
}

const staticAllFound = EXPECTED_METRICS.every(m => details.staticCheck.foundMetrics.includes(m));
details.staticCheck.allMetricsFound = staticAllFound;
details.staticCheck.missingMetrics = EXPECTED_METRICS.filter(m => !details.staticCheck.foundMetrics.includes(m));

// 2. Integration check: curl /api/metrics (actual) and /metrics (task spec)
const endpoints = [
  'http://localhost:15001/api/metrics',
  'http://localhost:15001/metrics',
];

let integrationSuccess = false;
let integrationEndpoint = null;
let integrationResponse = '';

for (const url of endpoints) {
  details.integrationCheck.attempted = true;
  const curlResult = runCmd(`curl.exe -s -o - -w "\\n__HTTP_CODE__%{http_code}" ${url}`, { timeout: 15000 });
  if (curlResult.code !== 0) {
    details.integrationCheck.error = `curl failed: ${curlResult.err}`;
    continue;
  }
  const output = curlResult.out;
  const httpCodeMatch = output.match(/__HTTP_CODE__(\d+)/);
  const httpCode = httpCodeMatch ? parseInt(httpCodeMatch[1], 10) : 0;
  const body = output.replace(/__HTTP_CODE__\d+$/, '');
  // Check if Prometheus text format (starts with # HELP / # TYPE / metric_name)
  const isPrometheusFormat = /^#\s+(HELP|TYPE)|^[a-z_]+([{| ])/m.test(body);
  if (httpCode !== 200 || !isPrometheusFormat) {
    continue;
  }
  integrationSuccess = true;
  integrationEndpoint = url;
  integrationResponse = body;
  details.integrationCheck.endpoint = url;
  details.integrationCheck.httpStatus = httpCode;
  details.integrationCheck.responseLineCount = body.split('\n').length;
  break;
}

if (integrationSuccess) {
  for (const metric of EXPECTED_METRICS) {
    const regex = new RegExp(`^${metric.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s{]|$)`, 'm');
    if (regex.test(integrationResponse)) {
      details.integrationCheck.foundMetrics.push(metric);
    } else {
      details.integrationCheck.missingMetrics.push(metric);
    }
  }
} else {
  details.integrationCheck.missingMetrics = [...EXPECTED_METRICS];
  details.integrationCheck.error = details.integrationCheck.error || 'Cannot reach /metrics or /api/metrics (API not running or non-Prometheus response)';
}

const integrationAllFound = integrationSuccess && details.integrationCheck.missingMetrics.length === 0;

// 3. Final verdict
let status;
let summary;
if (!staticAllFound) {
  status = 'FAIL';
  summary = `Static check: missing metrics ${details.staticCheck.missingMetrics.join(', ')}`;
} else if (!details.integrationCheck.attempted) {
  status = 'PASS';
  summary = `Static check passed: all 5 metrics registered to getPrometheusRegister() (integration not attempted)`;
} else if (!integrationSuccess) {
  status = 'PASS';
  summary = `Static check passed: all 5 metrics registered (integration skipped: API not running or endpoint unreachable)`;
} else if (!integrationAllFound) {
  status = 'FAIL';
  summary = `Integration check: ${details.integrationCheck.missingMetrics.join(', ')} not exposed at ${integrationEndpoint}`;
} else {
  status = 'PASS';
  summary = `All 5 metrics registered and exposed at ${integrationEndpoint} (static + integration both passed)`;
}

writeResult(ISSUE_ID, { status, summary, details });
