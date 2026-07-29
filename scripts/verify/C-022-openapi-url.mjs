// C-022: OpenAPI URL 验证
// 读 docs/openapi.yaml 和 openapi-registry.ts，验证 server.url 是 http://localhost:15001 而非 5001
import { fileExists, readFileContent, writeResult } from './_lib.mjs';

try {
  const files = [
    'docs/openapi.yaml',
    'packages/backend/src/schemas/openapi-registry.ts',
  ];

  const results = {};
  let hasOldUrl = false;
  let hasNewUrl = false;

  for (const f of files) {
    if (!fileExists(f)) {
      results[f] = { exists: false, urls: [] };
      continue;
    }
    const content = readFileContent(f);
    // 搜索 localhost:XXXX
    const urlMatches = content.match(/localhost:\d+/g) ?? [];
    const uniqueUrls = [...new Set(urlMatches)];
    results[f] = {
      exists: true,
      urls: uniqueUrls,
      hasOldUrl: uniqueUrls.includes('localhost:5001'),
      hasNewUrl: uniqueUrls.includes('localhost:15001'),
    };
    if (uniqueUrls.includes('localhost:5001')) hasOldUrl = true;
    if (uniqueUrls.includes('localhost:15001')) hasNewUrl = true;
  }

  const isPass = !hasOldUrl && hasNewUrl;

  writeResult('C-022', {
    status: isPass ? 'PASS' : 'FAIL',
    summary: isPass
      ? 'OpenAPI server.url 为 http://localhost:15001 (已修复)'
      : `OpenAPI URL 未修复: hasOldUrl(5001)=${hasOldUrl}, hasNewUrl(15001)=${hasNewUrl}`,
    details: {
      files: results,
      hasOldUrl,
      hasNewUrl,
    },
  });
} catch (e) {
  writeResult('C-022', {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    error: e.message,
  });
}