// C-025: Trivy 验证
// 读 .github/workflows/ci.yml，验证 Trivy 安全门控有效
// 检查：Trivy 步骤没有 continue-on-error: true，或有最终 enforcement 步骤检查 outcome
import { fileExists, readFileContent, writeResult } from './_lib.mjs';

try {
  const targetFile = '.github/workflows/ci.yml';

  if (!fileExists(targetFile)) {
    writeResult('C-025', {
      status: 'FAIL',
      summary: `${targetFile} 不存在`,
    });
    process.exit(0);
  }

  const content = readFileContent(targetFile);
  const lines = content.split('\n');

  // 找到 trivy 步骤
  const trivyStepRanges = [];
  const seenStarts = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (/trivy/i.test(lines[i])) {
      // 找到步骤的起始 (向前找 "- " 开头的行)
      let stepStart = i;
      for (let j = i; j >= 0; j--) {
        if (/^\s*-\s/.test(lines[j])) {
          stepStart = j;
          break;
        }
      }
      if (seenStarts.has(stepStart)) continue;
      seenStarts.add(stepStart);

      // 找到步骤的结束
      let stepEnd = lines.length - 1;
      for (let j = stepStart + 1; j < lines.length; j++) {
        if (/^\s*-\s/.test(lines[j])) {
          stepEnd = j - 1;
          break;
        }
      }

      const stepLines = lines.slice(stepStart, stepEnd + 1);
      const hasContinueOnError = stepLines.some(l => /continue-on-error\s*:\s*true/i.test(l));
      const isScanStep = stepLines.some(l => /uses:\s*aquasecurity\/trivy-action/i.test(l));

      trivyStepRanges.push({
        trivyLine: i + 1,
        stepStart: stepStart + 1,
        stepEnd: stepEnd + 1,
        hasContinueOnError,
        isScanStep,
      });
    }
  }

  if (trivyStepRanges.length === 0) {
    writeResult('C-025', {
      status: 'FAIL',
      summary: `${targetFile} 中未找到 trivy 步骤`,
      details: { trivyStepCount: 0 },
    });
    process.exit(0);
  }

  // 检查是否有最终 enforcement 步骤（检查 steps.trivy-*.outcome）
  // 搜索整个文件中 steps.trivy-*.outcome 的引用
  const enforcementMatches = [];
  for (let i = 0; i < lines.length; i++) {
    if (/steps\.trivy-.*\.outcome/i.test(lines[i])) {
      enforcementMatches.push({ line: i + 1, text: lines[i].trim() });
    }
  }

  // 也检查是否有 exit 1 或 ::error:: 来实际阻断构建
  const hasExitFail = enforcementMatches.some(m => {
    // 查看附近的行是否有 exit 1 或 ::error::
    const nearby = lines.slice(Math.max(0, m.line - 1), Math.min(lines.length, m.line + 10));
    return nearby.some(l => /exit\s+1|::error::/i.test(l));
  });

  const scanSteps = trivyStepRanges.filter(s => s.isScanStep);
  const scanStepsWithContinueOnError = scanSteps.filter(s => s.hasContinueOnError);
  const anyHasContinueOnError = scanStepsWithContinueOnError.length > 0;

  // 判定逻辑：
  // PASS 条件：Trivy 扫描步骤无 continue-on-error: true
  //          或 有 continue-on-error: true 但存在最终 enforcement 步骤（检查 outcome + exit 1）
  const isPass = !anyHasContinueOnError || (enforcementMatches.length > 0 && hasExitFail);

  let summary;
  if (!anyHasContinueOnError) {
    summary = `Trivy 步骤无 continue-on-error: true (${scanSteps.length} 个扫描步骤)`;
  } else if (enforcementMatches.length > 0 && hasExitFail) {
    summary = `Trivy 扫描步骤有 continue-on-error: true (${scanStepsWithContinueOnError.length}/${scanSteps.length} 个), 但有最终 enforcement 步骤检查 outcome + exit 1, 安全门控有效`;
  } else {
    summary = `Trivy 步骤有 continue-on-error: true (${scanStepsWithContinueOnError.length}/${scanSteps.length} 个扫描步骤), 且无有效 enforcement 步骤`;
  }

  writeResult('C-025', {
    status: isPass ? 'PASS' : 'FAIL',
    summary,
    details: {
      trivyStepCount: trivyStepRanges.length,
      scanStepCount: scanSteps.length,
      scanStepsWithContinueOnError: scanStepsWithContinueOnError.length,
      hasEnforcement: enforcementMatches.length > 0,
      hasExitFail,
      enforcementMatches,
      steps: trivyStepRanges.map(s => ({
        trivyLine: s.trivyLine,
        stepRange: `${s.stepStart}-${s.stepEnd}`,
        hasContinueOnError: s.hasContinueOnError,
        isScanStep: s.isScanStep,
      })),
    },
  });
} catch (e) {
  writeResult('C-025', {
    status: 'FAIL',
    summary: `验证脚本异常: ${e.message}`,
    error: e.message,
  });
}