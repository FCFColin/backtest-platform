// C-018: singleflight 验证
// 检查 backtestResultCache.ts 中 inFlight Map 的 set/get/delete 三种操作
import { fileExists, grepInCode, writeResult } from './_lib.mjs';

try {
  // 文件实际路径在 application/backtest/ 下
  const targetFile = 'packages/backend/src/application/backtest/backtestResultCache.ts';

  if (!fileExists(targetFile)) {
    writeResult('C-018', {
      status: 'FAIL',
      summary: `${targetFile} 不存在`,
    });
    process.exit(0);
  }

  // 用 grepInCode 搜索 inFlight.(set|get|delete) 在 application/backtest 目录
  const matches = grepInCode(/inFlight\.(set|get|delete)/, 'packages/backend/src/application/backtest', {
    extensions: ['.ts'],
  });

  // 过滤只看 backtestResultCache.ts
  const fileMatches = matches.filter(m => m.file.includes('backtestResultCache.ts'));

  // 检查三种操作都有
  const operations = new Set();
  for (const m of fileMatches) {
    const opMatch = m.text.match(/inFlight\.(set|get|delete)/);
    if (opMatch) operations.add(opMatch[1]);
  }

  const hasSet = operations.has('set');
  const hasGet = operations.has('get');
  const hasDelete = operations.has('delete');
  const allThree = hasSet && hasGet && hasDelete;

  writeResult('C-018', {
    status: allThree ? 'PASS' : 'FAIL',
    summary: allThree
      ? `inFlight Map 三种操作齐全 (set/get/delete), 共 ${fileMatches.length} 处匹配`
      : `inFlight Map 操作不完整: set=${hasSet}, get=${hasGet}, delete=${hasDelete}`,
    details: {
      targetFile,
      totalMatches: fileMatches.length,
      hasSet,
      hasGet,
      hasDelete,
      matches: fileMatches.map(m => ({ file: m.file, line: m.line, text: m.text })),
    },
  });
} catch (e) {
  writeResult('C-018', {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    error: e.message,
  });
}