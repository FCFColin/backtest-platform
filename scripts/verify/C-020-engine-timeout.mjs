// C-020: engine timeout 验证
// 读 engineConfig.ts，验证 ENGINE_TIMEOUT_MS >= 120000
import { fileExists, readFileContent, writeResult } from './_lib.mjs';

try {
  const targetFile = 'packages/backend/src/config/engineConfig.ts';

  if (!fileExists(targetFile)) {
    writeResult('C-020', {
      status: 'FAIL',
      summary: `${targetFile} 不存在`,
    });
    process.exit(0);
  }

  const content = readFileContent(targetFile);

  // 查找 ENGINE_TIMEOUT_MS 的值
  // 可能的格式:
  // 1. ENGINE_TIMEOUT_MS: 120000
  // 2. ENGINE_TIMEOUT_MS: parseInt(process.env.ENGINE_TIMEOUT_MS || '120000', 10)
  // 3. ENGINE_TIMEOUT_MS = 120000
  let timeoutMs = null;
  let matchLine = '';

  // Pattern 1: 直接数字赋值
  const directMatch = content.match(/ENGINE_TIMEOUT_MS\s*[=:]\s*(\d+)/);
  if (directMatch) {
    timeoutMs = parseInt(directMatch[1], 10);
    matchLine = directMatch[0];
  }

  // Pattern 2: parseInt(process.env.X || 'NNNNN', 10)
  if (timeoutMs === null) {
    const parseIntMatch = content.match(/ENGINE_TIMEOUT_MS\s*:\s*parseInt\([^)]*?\|\|\s*['"](\d+)['"]/);
    if (parseIntMatch) {
      timeoutMs = parseInt(parseIntMatch[1], 10);
      matchLine = parseIntMatch[0];
    }
  }

  // Pattern 3: process.env.X || 'NNNNN' (without parseInt)
  if (timeoutMs === null) {
    const envMatch = content.match(/ENGINE_TIMEOUT_MS\s*[=:]\s*[^;]*?\|\|\s*['"](\d+)['"]/);
    if (envMatch) {
      timeoutMs = parseInt(envMatch[1], 10);
      matchLine = envMatch[0];
    }
  }

  if (timeoutMs === null) {
    writeResult('C-020', {
      status: 'FAIL',
      summary: `${targetFile} 中未找到 ENGINE_TIMEOUT_MS 的数值`,
      details: { content: content.slice(0, 2000) },
    });
    process.exit(0);
  }

  const isPass = timeoutMs >= 120000;

  writeResult('C-020', {
    status: isPass ? 'PASS' : 'FAIL',
    summary: isPass
      ? `ENGINE_TIMEOUT_MS = ${timeoutMs}ms (>= 120000ms)`
      : `ENGINE_TIMEOUT_MS = ${timeoutMs}ms (< 120000ms, 不达标)`,
    details: {
      timeoutMs,
      threshold: 120000,
      matchLine,
    },
  });
} catch (e) {
  writeResult('C-020', {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    error: e.message,
  });
}