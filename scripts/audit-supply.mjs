#!/usr/bin/env node
// 供应链漏洞审计：prod 依赖 CRITICAL/HIGH 阻断，moderate/low 仅告警
// 用法：node scripts/audit-supply.mjs
import { spawnSync } from 'node:child_process';

// Windows 下 pnpm 是 .cmd/.ps1 shim，需经 shell 解析
const res = spawnSync('pnpm audit --prod --json --ignore-registry-errors', {
  encoding: 'utf-8',
  shell: true,
});
let report;
try {
  report = JSON.parse(res.stdout || '');
} catch {
  // 审计自身失败时 fail-closed：无法确认无漏洞即阻断
  console.error(`pnpm audit 失败（exit=${res.status}），供应链门禁阻断`);
  process.exit(1);
}
const { critical = 0, high = 0, moderate = 0, low = 0 } = report.metadata?.vulnerabilities ?? {};
console.log(`供应链审计: critical=${critical} high=${high} moderate=${moderate} low=${low}`);

for (const adv of Object.values(report.advisories ?? {})) {
  console.warn(`  [${adv.severity}] ${adv.module_name}: ${adv.title}`);
}

if (critical + high > 0) {
  console.error(`prod 依赖存在 ${critical + high} 个 CRITICAL/HIGH 漏洞，阻断发布`);
  process.exit(1);
}
