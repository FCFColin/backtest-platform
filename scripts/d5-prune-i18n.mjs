// D-5 三重过滤候选生成 + 安全删除执行（一次性工具）
// 用法：node scripts/d5-prune-i18n.mjs [--apply]
// 候选 = 静态 unusedZh（verify-i18n 产出·已排除保护前缀）
//        ∩ 运行时未出现（30 路由采样 619 键 @本会话）
import { readFileSync, writeFileSync } from 'node:fs';

const [, , applyFlag] = process.argv;
const baseline = JSON.parse(readFileSync('docs/audit/reports/p0-0-2-i18n-baseline.json', 'utf-8'));
const runtime = JSON.parse(readFileSync('docs/audit/reports/i18n-used-keys-runtime.json', 'utf-8'));
const seen = new Set(Object.values(runtime.byRoute).flatMap((v) => (Array.isArray(v) ? v : [])));
seen.delete('__NAV_FAIL__');

const candidates = baseline.unusedZh.filter((k) => !seen.has(k));
const skippedRuntimeSeen = baseline.unusedZh.length - candidates.length;

const localePath = 'packages/frontend/src/i18n/locales/zh-CN/common.json';
const dict = JSON.parse(readFileSync(localePath, 'utf-8'));
let removed = 0;
for (const k of candidates) {
  if (k in dict) {
    delete dict[k];
    removed++;
  }
}

console.log(
  JSON.stringify(
    {
      staticUnused: baseline.unusedZh.length,
      protectedDynamic: baseline.protectedDynamicKeys ?? null,
      runtimeSeenTotal: seen.size,
      skippedRuntimeSeen,
      candidates: candidates.length,
      removedFromLocale: removed,
      mode: applyFlag === '--apply' ? 'APPLY' : 'DRY-RUN',
    },
    null,
    2,
  ),
);
if (applyFlag === '--apply') {
  writeFileSync(localePath, JSON.stringify(dict, null, 2) + '\n');
  console.log('locale written:', localePath);
}
