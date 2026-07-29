// C-014: Go 覆盖率验证
// cd engine-go 运行 go test，验证总覆盖率 >= 70%，检查 8 个目标包覆盖率 > 0%
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCmd, writeResult, PROJECT_ROOT_PATH } from './_lib.mjs';

try {
  const engineDir = join(PROJECT_ROOT_PATH, 'engine-go');
  if (!existsSync(engineDir)) {
    writeResult('C-014', {
      status: 'FAIL',
      summary: 'engine-go 目录不存在',
    });
    process.exit(0);
  }

  // 运行 go test 并生成覆盖率
  const testR = runCmd('cd engine-go && go test ./... -coverprofile=coverage.out', { timeout: 300000 });
  const testOutput = (testR.out + '\n' + testR.err).trim();

  if (testR.code !== 0) {
    writeResult('C-014', {
      status: 'FAIL',
      summary: `go test 失败 (exit code ${testR.code})`,
      details: {
        exitCode: testR.code,
        outputTail: testOutput.slice(-2000),
      },
    });
    process.exit(0);
  }

  // 获取覆盖率报告
  const coverR = runCmd('cd engine-go && go tool cover -func=coverage.out');
  const coverOutput = coverR.out.trim();

  if (coverR.code !== 0 || !coverOutput) {
    writeResult('C-014', {
      status: 'FAIL',
      summary: `go tool cover 执行失败 (exit code ${coverR.code})`,
      details: { err: coverR.err, out: coverR.out.slice(-500) },
    });
    process.exit(0);
  }

  // 最后一行: "total:    statements: 75.4%"
  const lines = coverOutput.split('\n');
  const totalLine = lines[lines.length - 1];
  const totalMatch = totalLine.match(/([\d.]+)%/);
  const totalCoverage = totalMatch ? parseFloat(totalMatch[1]) : 0;

  // 检查 8 个原本 0% 的包
  const targetPkgs = [
    'signal', 'pca', 'letf', 'factorregression',
    'goaloptimizer', 'mathutil', 'calculators', 'engine/tactical',
  ];
  const pkgResults = {};

  for (const pkg of targetPkgs) {
    // 搜索 internal/{pkg}/ 的行
    const pkgLines = lines.filter(l => l.includes(`internal/${pkg}/`));
    if (pkgLines.length === 0) {
      pkgResults[pkg] = { found: false, maxCoverage: 0, note: '未在覆盖率报告中找到' };
    } else {
      // 解析每行的覆盖率百分比
      const pcts = pkgLines.map(l => {
        const m = l.match(/([\d.]+)%/);
        return m ? parseFloat(m[1]) : 0;
      });
      const max = Math.max(...pcts);
      const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      pkgResults[pkg] = {
        found: true,
        maxCoverage: parseFloat(max.toFixed(2)),
        avgCoverage: parseFloat(avg.toFixed(2)),
        functionCount: pkgLines.length,
      };
    }
  }

  const allPkgsHaveCoverage = Object.values(pkgResults).every(r => r.found && r.maxCoverage > 0);
  const totalPass = totalCoverage >= 70;
  const isPass = totalPass && allPkgsHaveCoverage;

  writeResult('C-014', {
    status: isPass ? 'PASS' : 'FAIL',
    summary: isPass
      ? `Go 覆盖率达标: 总覆盖率 ${totalCoverage}% (>= 70%), 8 个目标包均有覆盖`
      : `Go 覆盖率未达标: 总覆盖率 ${totalCoverage}% (需 >= 70%), ${allPkgsHaveCoverage ? '8 个目标包均有覆盖' : '部分目标包无覆盖'}`,
    details: {
      totalCoverage,
      totalPass,
      targetPackages: pkgResults,
      testExitCode: testR.code,
      totalLine,
    },
  });
} catch (e) {
  writeResult('C-014', {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    error: e.message,
  });
}