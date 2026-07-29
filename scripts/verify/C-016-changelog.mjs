// C-016: CHANGELOG 验证
// 读 CHANGELOG.md 最新条目日期，读 git log 最新提交日期，验证 changelog 日期 >= 最新提交 - 7 天
import { readFileContent, writeResult, runCmd, fileExists } from './_lib.mjs';

try {
  if (!fileExists('CHANGELOG.md')) {
    writeResult('C-016', {
      status: 'FAIL',
      summary: 'CHANGELOG.md 不存在',
    });
    process.exit(0);
  }

  const changelog = readFileContent('CHANGELOG.md');

  // 提取最新条目日期: "## [1.0.0] - 2026-07-28"
  const dateMatches = [...changelog.matchAll(/^## \[[\d.]+\]\s*-\s*(\d{4}-\d{2}-\d{2})/gm)];
  const dates = dateMatches.map(m => m[1]);

  if (dates.length === 0) {
    writeResult('C-016', {
      status: 'FAIL',
      summary: 'CHANGELOG.md 中未找到日期条目 (格式: ## [x.y.z] - YYYY-MM-DD)',
      details: { contentHead: changelog.slice(0, 500) },
    });
    process.exit(0);
  }

  const latestChangelogDate = dates[0]; // 最新条目在文件最上方

  // 获取最新提交日期
  const gitR = runCmd('git log -1 --format=%ai');
  const gitOutput = gitR.out.trim();
  const latestCommitDate = gitOutput.split(' ')[0]; // YYYY-MM-DD

  if (!latestCommitDate) {
    writeResult('C-016', {
      status: 'FAIL',
      summary: '无法获取 git log 最新提交日期',
      details: { gitOutput },
    });
    process.exit(0);
  }

  // 计算日期差
  const changelogTime = new Date(latestChangelogDate).getTime();
  const commitTime = new Date(latestCommitDate).getTime();
  const diffDays = (commitTime - changelogTime) / (1000 * 60 * 60 * 24);

  // changelog 日期应 >= 最新提交 - 7 天
  // 即 commit - changelog <= 7 天
  const isPass = diffDays <= 7;

  writeResult('C-016', {
    status: isPass ? 'PASS' : 'FAIL',
    summary: isPass
      ? `CHANGELOG 最新日期 ${latestChangelogDate} 在最新提交 ${latestCommitDate} 7 天内`
      : `CHANGELOG 过期: 最新日期 ${latestChangelogDate}, 最新提交 ${latestCommitDate}, 差 ${diffDays.toFixed(1)} 天`,
    details: {
      latestChangelogDate,
      latestCommitDate,
      diffDays: parseFloat(diffDays.toFixed(1)),
      allChangelogDates: dates.slice(0, 5),
    },
  });
} catch (e) {
  writeResult('C-016', {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    error: e.message,
  });
}