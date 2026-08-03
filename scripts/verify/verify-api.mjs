// scripts/verify/verify-api.mjs
// API 类验证聚合：C-022 (OpenAPI URL) + C-023 (ADR-031 degraded)
// 合并自：C-022-openapi-url.mjs + C-023-adr-031-degraded.mjs
import { fileExists, readFileContent, runCheck, finishVerify } from './_lib.mjs';

const results = {};

// ── C-022: OpenAPI URL 验证 ────────────────────────────────────
await runCheck(results, 'C-022', () => {
  const C022_FILES = [
    'packages/backend/src/schemas/openapi-registry.ts',
  ];
  const C022_fileResults = {};
  let C022_hasOldUrl = false;
  let C022_hasNewUrl = false;

  for (const f of C022_FILES) {
    if (!fileExists(f)) {
      C022_fileResults[f] = { exists: false, urls: [] };
      continue;
    }
    const content = readFileContent(f);
    const urlMatches = content.match(/localhost:\d+/g) ?? [];
    const uniqueUrls = [...new Set(urlMatches)];
    C022_fileResults[f] = {
      exists: true,
      urls: uniqueUrls,
      hasOldUrl: uniqueUrls.includes('localhost:5001'),
      hasNewUrl: uniqueUrls.includes('localhost:15001'),
    };
    if (uniqueUrls.includes('localhost:5001')) C022_hasOldUrl = true;
    if (uniqueUrls.includes('localhost:15001')) C022_hasNewUrl = true;
  }

  const C022_pass = !C022_hasOldUrl && C022_hasNewUrl;
  return {
    status: C022_pass ? 'PASS' : 'FAIL',
    summary: C022_pass
      ? 'OpenAPI server.url 为 http://localhost:15001 (已修复)'
      : `OpenAPI URL 未修复: hasOldUrl(5001)=${C022_hasOldUrl}, hasNewUrl(15001)=${C022_hasNewUrl}`,
    details: { files: C022_fileResults, hasOldUrl: C022_hasOldUrl, hasNewUrl: C022_hasNewUrl },
  };
});

// ── C-023: ADR-031 degraded 验证 ───────────────────────────────
await runCheck(results, 'C-023', () => {
  const C023_targetFile = 'packages/backend/src/routes/routeUtils.ts';
  if (!fileExists(C023_targetFile)) {
    return { status: 'FAIL', summary: `${C023_targetFile} 不存在` };
  }
  const content = readFileContent(C023_targetFile);
  const lines = content.split('\n');
  const allDegradedLines = [];
  const responseFieldLines = [];
  const metricsLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/degraded/i.test(line)) continue;
    const lineNum = i + 1;
    const trimmed = line.trim();
    allDegradedLines.push({ line: lineNum, text: trimmed });

    if (/recordDegraded/i.test(line)) {
      metricsLines.push({ line: lineNum, text: trimmed, reason: 'metrics function' });
      continue;
    }
    if (/^\s*(\*|\/\/|\/\*)/.test(line)) {
      metricsLines.push({ line: lineNum, text: trimmed, reason: 'comment' });
      continue;
    }
    if (/^\s*import\s/.test(line)) {
      metricsLines.push({ line: lineNum, text: trimmed, reason: 'import' });
      continue;
    }
    if (/\bdegraded\s*:/.test(line) || /['"]degraded['"]\s*:/.test(line)) {
      responseFieldLines.push({ line: lineNum, text: trimmed });
    } else {
      responseFieldLines.push({ line: lineNum, text: trimmed, suspicious: true });
    }
  }

  const C023_pass = responseFieldLines.length === 0;
  return {
    status: C023_pass ? 'PASS' : 'FAIL',
    summary: C023_pass
      ? `${C023_targetFile} 中无 degraded 响应字段 (符合 ADR-031); ${metricsLines.length} 处 metrics/import/注释被排除`
      : `${C023_targetFile} 中有 ${responseFieldLines.length} 处可能的 degraded 响应字段 (违反 ADR-031)`,
    details: {
      totalMatches: allDegradedLines.length,
      responseFieldCount: responseFieldLines.length,
      metricsExcluded: metricsLines.length,
      responseFieldLines,
      metricsLines,
    },
  };
});

finishVerify('verify-api', results);
