// C-025: Trivy 安全门控验证
import { fileExists, readFileContent, writeResult } from './_lib.mjs';

try {
  const targetFile = '.github/workflows/ci.yml';
  if (!fileExists(targetFile)) {
    writeResult('C-025', { status: 'FAIL', summary: `${targetFile} 不存在` });
    process.exit(0);
  }
  const lines = readFileContent(targetFile).split('\n');

  // Find trivy scan steps and check for continue-on-error
  const trivySteps = [];
  const seenStarts = new Set();
  for (let i = 0; i < lines.length; i++) {
    if (!/trivy/i.test(lines[i])) continue;
    let stepStart = i;
    for (let j = i; j >= 0; j--) { if (/^\s*-\s/.test(lines[j])) { stepStart = j; break; } }
    if (seenStarts.has(stepStart)) continue;
    seenStarts.add(stepStart);
    let stepEnd = lines.length - 1;
    for (let j = stepStart + 1; j < lines.length; j++) { if (/^\s*-\s/.test(lines[j])) { stepEnd = j - 1; break; } }
    const stepLines = lines.slice(stepStart, stepEnd + 1);
    trivySteps.push({
      hasContinueOnError: stepLines.some((l) => /continue-on-error\s*:\s*true/i.test(l)),
      isScanStep: stepLines.some((l) => /uses:\s*aquasecurity\/trivy-action/i.test(l)),
    });
  }

  if (trivySteps.length === 0) {
    writeResult('C-025', { status: 'FAIL', summary: 'ci.yml 中未找到 trivy 步骤' });
    process.exit(0);
  }

  const enforcementLines = lines.filter((l) => /steps\.trivy-.*\.outcome/i.test(l));
  const nearbyExit = enforcementLines.some((_, i) => {
    const start = lines.indexOf(enforcementLines[i]);
    return lines.slice(Math.max(0, start), Math.min(lines.length, start + 11)).some((l) => /exit\s+1|::error::/i.test(l));
  });

  const scanSteps = trivySteps.filter((s) => s.isScanStep);
  const withContinue = scanSteps.filter((s) => s.hasContinueOnError);
  const pass = withContinue.length === 0 || (enforcementLines.length > 0 && nearbyExit);

  writeResult('C-025', {
    status: pass ? 'PASS' : 'FAIL',
    summary: pass
      ? withContinue.length === 0
        ? `Trivy 无 continue-on-error (${scanSteps.length} 扫描步骤)`
        : `有 continue-on-error 但有 enforcement (exit 1)，门控有效`
      : `Trivy 有 continue-on-error (${withContinue.length}/${scanSteps.length}) 且无 enforcement`,
    details: { scanStepCount: scanSteps.length, withContinueOnError: withContinue.length, hasEnforcement: enforcementLines.length > 0 },
  });
} catch (e) {
  writeResult('C-025', { status: 'FAIL', summary: `验证脚本异常: ${e.message}` });
}
