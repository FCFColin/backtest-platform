// C-023: ADR-031 degraded 验证
// 智能体 A 应已移除 ADR-031 中的 degraded 字段
// 搜索 routeUtils.ts 中 degraded 关键字（排除 metrics 函数名 recordDegraded*）
// 引擎端响应体不能有 degraded 字段（数据服务降级可以有）
import { fileExists, readFileContent, writeResult } from './_lib.mjs';

try {
  const targetFile = 'packages/backend/src/routes/routeUtils.ts';

  if (!fileExists(targetFile)) {
    writeResult('C-023', {
      status: 'FAIL',
      summary: `${targetFile} 不存在`,
    });
    process.exit(0);
  }

  const content = readFileContent(targetFile);

  // 搜索所有包含 degraded 的行
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

    // 排除 metrics 函数名：recordDegraded, recordDegradedResponse
    if (/recordDegraded/i.test(line)) {
      metricsLines.push({ line: lineNum, text: trimmed, reason: 'metrics function' });
      continue;
    }

    // 排除注释行
    if (/^\s*(\*|\/\/|\/\*)/.test(line)) {
      metricsLines.push({ line: lineNum, text: trimmed, reason: 'comment' });
      continue;
    }

    // 排除 import 行（recordDegradedResponse 在 import 中）
    if (/^\s*import\s/.test(line)) {
      metricsLines.push({ line: lineNum, text: trimmed, reason: 'import' });
      continue;
    }

    // 剩余的行可能表示响应字段
    // 检查是否是响应体属性：degraded: 或 'degraded': 或 "degraded":
    if (/\bdegraded\s*:/.test(line) || /['"]degraded['"]\s*:/.test(line)) {
      responseFieldLines.push({ line: lineNum, text: trimmed });
    } else {
      // 其他包含 degraded 的行，标记为可疑
      responseFieldLines.push({ line: lineNum, text: trimmed, suspicious: true });
    }
  }

  // 引擎端响应体不应有 degraded 字段
  // 如果所有匹配都是 metrics/import/comment，则 PASS
  const isPass = responseFieldLines.length === 0;

  writeResult('C-023', {
    status: isPass ? 'PASS' : 'FAIL',
    summary: isPass
      ? `${targetFile} 中无 degraded 响应字段 (符合 ADR-031); ${metricsLines.length} 处 metrics/import/注释被排除`
      : `${targetFile} 中有 ${responseFieldLines.length} 处可能的 degraded 响应字段 (违反 ADR-031)`,
    details: {
      totalMatches: allDegradedLines.length,
      responseFieldCount: responseFieldLines.length,
      metricsExcluded: metricsLines.length,
      responseFieldLines,
      metricsLines,
    },
  });
} catch (e) {
  writeResult('C-023', {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    error: e.message,
  });
}