// C-021: BullMQ DLQ 验证
// 在 packages/backend/src/queues 搜索 deadLetterQueue|dlq|DeadLetterQueue，验证至少有 1 处
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { grepInCode, writeResult, PROJECT_ROOT_PATH } from './_lib.mjs';

try {
  const targetDir = 'packages/backend/src/queues';
  const absDir = join(PROJECT_ROOT_PATH, targetDir);

  if (!existsSync(absDir)) {
    writeResult('C-021', {
      status: 'FAIL',
      summary: `${targetDir} 目录不存在`,
    });
    process.exit(0);
  }

  // 搜索 deadLetterQueue|dlq|DeadLetterQueue
  const matches = grepInCode(/deadLetterQueue|dlq|DeadLetterQueue/i, targetDir, {
    extensions: ['.ts'],
  });

  const isPass = matches.length >= 1;

  writeResult('C-021', {
    status: isPass ? 'PASS' : 'FAIL',
    summary: isPass
      ? `BullMQ DLQ 已配置 (${matches.length} 处匹配)`
      : `未找到 BullMQ DLQ 配置 (0 处匹配)`,
    details: {
      matchCount: matches.length,
      matches: matches.map(m => ({ file: m.file, line: m.line, text: m.text })),
    },
  });
} catch (e) {
  writeResult('C-021', {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    error: e.message,
  });
}