import { PLAN_LIMITS, type PlanLimits } from '../../config/index.js';
import { getOrg } from '../org/membershipService.js';
import { logger } from '../../utils/logger.js';

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;
}

// 组织计划额度查询：org 查询失败时降级 free（fail-safe）。quota 中间件走自己的 fail-closed 语义，不共用。
export async function getOrgPlanLimit(
  tenantId: string,
  key: keyof PlanLimits,
  warnMsg: string,
): Promise<number> {
  try {
    const org = await getOrg(tenantId);
    return getPlanLimits(org?.plan ?? null)[key];
  } catch (err) {
    logger.warn({ err: String(err), tenantId }, warnMsg);
    return getPlanLimits('free')[key];
  }
}

export function currentPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
