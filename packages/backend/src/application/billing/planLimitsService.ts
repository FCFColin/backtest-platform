/**
 * 按计划查表与计费周期服务（ADR-037）
 *
 * 企业理由：将套餐配额的查表逻辑从静态配置中分离，便于单测与多环境覆盖
 * （未来可由 DB/远程配置下发）。配额中间件、限流与计量均通过本服务消费。
 *
 * 设计：纯函数，无副作用，依赖 config/planLimits.js 的静态 PLAN_LIMITS 表。
 */

import { PLAN_LIMITS, type PlanLimits } from '../../config/planLimits.js';

/**
 * 获取指定计划的配额（未知计划回落到 free，fail-safe 取最严格）。
 *
 * @param plan - 计划标识
 * @returns 计划配额
 */
export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  if (plan === 'pro' || plan === 'enterprise' || plan === 'free') {
    return PLAN_LIMITS[plan];
  }
  return PLAN_LIMITS.free;
}

/**
 * 当前计费周期标识（UTC，形如 '2026-06'）。
 *
 * @param now - 当前时间（默认 new Date()）
 * @returns 形如 'YYYY-MM' 的计费周期字符串
 */
export function currentPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
