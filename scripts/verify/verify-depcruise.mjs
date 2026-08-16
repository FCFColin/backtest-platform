// scripts/verify/verify-depcruise.mjs
// C-024: 层间纪律门禁 — 对 depcruise 配置中全部 error 级规则做门禁（单一口径，不再重复清单）；
// no-circular 配置为 warn（既有环是前端组件族独立工作线，不阻塞 CI），仅记录数量。
import { runCmd, runCheck, finishVerify } from './_lib.mjs';
import layerConfig from '../../.dependency-cruiser.config.mjs';

const LAYER_RULES = new Set(
  layerConfig.forbidden.filter((r) => r.severity === 'error').map((r) => r.name),
);

const results = {};

await runCheck(results, 'C-024', () => {
  const r = runCmd(
    'pnpm exec depcruise --config .dependency-cruiser.config.mjs --output-type json packages/backend/src/ packages/frontend/src/ packages/shared/',
    { timeout: 180000 },
  );
  let violations = [];
  try {
    violations = JSON.parse(r.out).summary?.violations ?? [];
  } catch (e) {
    return { status: 'FAIL', summary: `depcruise 输出解析失败: ${e.message}` };
  }
  const layer = violations.filter((v) => LAYER_RULES.has(v.rule?.name));
  const circular = violations.filter((v) => v.rule?.name === 'no-circular');
  return {
    status: layer.length === 0 ? 'PASS' : 'FAIL',
    summary:
      layer.length === 0
        ? `层间规则无违规（no-circular 环 ${circular.length} 个，属独立工作线）`
        : `层间违规 ${layer.length} 处`,
    details: {
      layerViolations: layer,
      circularCount: circular.length,
      circular,
    },
  };
});

finishVerify('verify-depcruise', results);
