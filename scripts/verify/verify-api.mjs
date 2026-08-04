import { fileExists, readFileContent, runCheck, finishVerify } from './_lib.mjs';

const results = {};

await runCheck(results, 'C-022', () => {
  const f = 'packages/backend/src/schemas/openapi-registry.ts';
  if (!fileExists(f)) return { status: 'FAIL', summary: `${f} 不存在` };
  const urls = [...new Set(readFileContent(f).match(/localhost:\d+/g) ?? [])];
  const hasOld = urls.includes('localhost:5001');
  const hasNew = urls.includes('localhost:15001');
  return {
    status: !hasOld && hasNew ? 'PASS' : 'FAIL',
    summary: !hasOld && hasNew ? 'OpenAPI server.url 为 http://localhost:15001 (已修复)' : `OpenAPI URL 未修复: hasOldUrl(5001)=${hasOld}, hasNewUrl(15001)=${hasNew}`,
    details: { urls, hasOldUrl: hasOld, hasNewUrl: hasNew },
  };
});

await runCheck(results, 'C-023', () => {
  const f = 'packages/backend/src/routes/routeUtils.ts';
  if (!fileExists(f)) return { status: 'FAIL', summary: `${f} 不存在` };
  const lines = readFileContent(f).split('\n');
  const responseFieldLines = [];
  let metricsCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/degraded/i.test(lines[i])) continue;
    const trimmed = lines[i].trim();
    if (/recordDegraded|^\s*(\*|\/\/|\/\*)|^\s*import\s/.test(lines[i])) { metricsCount++; continue; }
    responseFieldLines.push({ line: i + 1, text: trimmed });
  }
  const pass = responseFieldLines.length === 0;
  return {
    status: pass ? 'PASS' : 'FAIL',
    summary: pass ? `${f} 中无 degraded 响应字段 (符合 ADR-031); ${metricsCount} 处 metrics/import/注释被排除` : `${f} 中有 ${responseFieldLines.length} 处可能的 degraded 响应字段 (违反 ADR-031)`,
    details: { responseFieldCount: responseFieldLines.length, metricsExcluded: metricsCount, responseFieldLines },
  };
});

finishVerify('verify-api', results);
