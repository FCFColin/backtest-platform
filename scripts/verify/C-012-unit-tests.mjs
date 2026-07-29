// C-012: 单元测试验证
// 运行 npm run test:unit，验证 "0 failed"，记录前 10 个失败用例
import { runCmd, writeResult } from './_lib.mjs';

try {
  const r = runCmd('npm run test:unit', { timeout: 300000, env: { FORCE_COLOR: '0', NO_COLOR: '1' } });
  let output = (r.out + '\n' + r.err).trim();

  // 移除 ANSI 颜色代码
  output = output.replace(/\x1b\[[0-9;]*m/g, '');

  // Parse Vitest summary
  // 实际格式（v1+）: "Tests  15 failed | 3154 passed | 88 skipped (3257)"
  // 或无失败时: "Tests  3013 passed | 5 skipped (3018)"
  // 分别从 Tests 行和 Test Files 行提取 failed/passed/skipped 计数
  function parseSummaryLine(label) {
    const lineMatch = output.match(
      new RegExp('^\\s*' + label + '\\s+(.+?)\\s*\\((\\d+)\\)\\s*$', 'm'),
    );
    if (!lineMatch) return { failed: 0, passed: 0, skipped: 0, total: 0, found: false };
    const parts = lineMatch[1];
    const failedMatch = parts.match(/(\d+)\s+failed/);
    const passedMatch = parts.match(/(\d+)\s+passed/);
    const skippedMatch = parts.match(/(\d+)\s+skipped/);
    return {
      failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
      passed: passedMatch ? parseInt(passedMatch[1], 10) : 0,
      skipped: skippedMatch ? parseInt(skippedMatch[1], 10) : 0,
      total: parseInt(lineMatch[2], 10),
      found: true,
    };
  }

  const tests = parseSummaryLine('Tests');
  const files = parseSummaryLine('Test Files');

  const testsPassed = tests.passed;
  const testsFailed = tests.failed;
  const testsSkipped = tests.skipped;
  const filesPassed = files.passed;
  const filesFailed = files.failed;

  // 提取失败用例名（前 10 个）
  const failedTests = [];
  if (testsFailed > 0 || (r.code !== 0 && !tests.found)) {
    // Pattern 1: vitest 失败用例（× 标记）
    const xPattern = /^\s*×\s+(.+?)(?:\s+\d+ms)?\s*$/gm;
    let m;
    while ((m = xPattern.exec(output)) !== null && failedTests.length < 10) {
      const name = m[1].trim();
      if (name && !name.includes('test.ts') && !name.includes('test.tsx')) {
        failedTests.push(name);
      }
    }
    // Pattern 2: "FAIL tests/unit/xxx.test.ts"
    if (failedTests.length === 0) {
      const failPattern = /FAIL\s+(.+?(?:\.test\.[jt]sx?))/g;
      while ((m = failPattern.exec(output)) !== null && failedTests.length < 10) {
        failedTests.push(m[1].trim());
      }
    }
  }

  // 判定结果：
  // - PASS: exit code 0 且 failed = 0
  // - FAIL: failed > 0
  // - CRASH: exit code != 0 且无法解析测试摘要（runner 崩溃）
  const isPass = r.code === 0 && testsFailed === 0;
  const isCrash = r.code !== 0 && !tests.found;

  let summary;
  if (isPass) {
    summary = '单测全部通过: ' + testsPassed + ' tests passed, 0 failed';
  } else if (isCrash) {
    summary = '单测运行异常: exit code ' + r.code + ', 无法解析测试摘要（runner 可能崩溃）';
  } else {
    summary = '单测失败: ' + testsFailed + ' failed / ' + testsPassed + ' passed / ' + testsSkipped + ' skipped (exit code: ' + r.code + ')';
  }

  writeResult('C-012', {
    status: isPass ? 'PASS' : 'FAIL',
    summary,
    details: {
      exitCode: r.code,
      testsPassed,
      testsFailed,
      testsSkipped,
      filesPassed,
      filesFailed,
      failedTests: failedTests.slice(0, 10),
      outputTail: output.slice(-3000),
    },
  });
} catch (e) {
  writeResult('C-012', {
    status: 'FAIL',
    summary: '验证脚本异常: ' + e.message,
    error: e.message,
  });
}