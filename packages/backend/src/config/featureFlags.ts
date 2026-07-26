/**
 * 特性开关公共 API（ADR-P1-06）
 *
 * 企业理由：所有业务代码通过本模块查询 flag，而非直接调用 Unleash SDK——
 * 集中 fail-closed 降级、上下文规整与审计日志，避免散落的 SDK 调用在
 * Unleash 未就绪时误开受保护功能。
 *
 * 安全降级：Unleash 初始化失败时 isEnabled 一律返回 false（fail-closed）。
 */
import { unleashClient } from '../infrastructure/unleashClient.js';
import { logger } from '../utils/logger.js';

/** flag 查询上下文：按用户/组织/计划精准投放策略 */
export interface FlagContext {
  userId?: string;
  orgId?: string;
  plan?: string;
}

/**
 * 查询 flag 是否启用。
 *
 * Unleash 未初始化时返回 false（fail-closed），确保未就绪的 flag 不会误开启
 * 受保护功能。orgId/plan 通过 properties 传递，供 Unleash 策略约束（如按计划投放）。
 */
export function isEnabled(flagName: string, context?: FlagContext): boolean {
  if (!unleashClient?.isInitialized) return false;
  return unleashClient.isEnabled(flagName, {
    userId: context?.userId,
    properties: { orgId: context?.orgId, plan: context?.plan },
  });
}

/**
 * 记录 flag 查询审计（T4）。
 *
 * 复用 pino logger 并打 audit: true 标记，与 auditLog 中间件保持一致的
 * 审计语义，便于日志采集系统（Loki/ES）按 audit 字段过滤。
 * flag 查询属读操作，不走 auditLog 中间件（该中间件仅记录 HTTP 写操作），
 * 故在此显式记录。
 */
export function logFlagAccess(
  flagName: string,
  context: FlagContext | undefined,
  enabled: boolean,
): void {
  logger.info(
    {
      audit: true,
      module: 'featureFlags',
      flagName,
      enabled,
      userId: context?.userId,
      orgId: context?.orgId,
      plan: context?.plan,
    },
    `[featureFlags] flag "${flagName}" 查询 → ${enabled}`,
  );
}

/**
 * 计划限制的 flag 迁移入口（ADR-P1-06）。
 *
 * 企业理由：planLimits 静态表（./planLimits.ts）的调整需重新部署；将"是否对某
 * 计划/组织启用增强配额或付费功能"迁移到 Unleash flag 后，可灰度放量、按组织
 * 精准开启，无需发版。此处仅提供 flag 查询入口与命名约定，配额执行仍在
 * middleware/quota.ts，避免侵入式改动破坏既有计费链路。
 */
export const PLAN_LIMIT_FLAGS = {
  /** 启用企业级增强配额（如更高 asyncConcurrency / maxTickers） */
  enterpriseQuota: 'plan.enterprise-quota',
  /** 启用 pro 计划高级分析功能 */
  proAnalytics: 'plan.pro-analytics',
} as const;

export type PlanLimitFlag = (typeof PLAN_LIMIT_FLAGS)[keyof typeof PLAN_LIMIT_FLAGS];

/** 查询某个计划限制相关 flag 是否对当前上下文启用 */
export function isPlanFeatureEnabled(flag: PlanLimitFlag, context?: FlagContext): boolean {
  return isEnabled(flag, context);
}
