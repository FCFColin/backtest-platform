/**
 * 计划配额、特性开关与安全检查（ADR-037 / ADR-P1-06 / P0-02）。
 * - PLAN_LIMITS：按计划的资源配额静态配置
 * - isEnabled / logFlagAccess / PLAN_LIMIT_FLAGS：特性开关公共 API（fail-closed 降级）
 * - assertNoDefaultSecrets：生产环境默认密钥启动拦截（fail-fast）
 */
import { unleashClient } from '../infrastructure/unleashClient.js';
import { logger } from '../utils/logger.js';

/** 订阅计划标识（与 organizations.plan 对齐） */
type PlanId = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  backtestsPerMonth: number;
  maxTickers: number;
  /** 同一组织同时在跑的异步任务上限（tenant-fair 调度用） */
  asyncConcurrency: number;
  /** 计算端点每分钟速率上限（限流 max） */
  rateLimitPerMin: number;
  /** 每租户可保存的战术配置上限（P1-1） */
  maxTacticalConfigs: number;
}

/** 计费计量指标名（与 usage_events.metric / usage_counters.metric 对齐） */
export const USAGE_METRIC = {
  BACKTEST: 'backtest',
} as const;

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    backtestsPerMonth: 100,
    maxTickers: 10,
    asyncConcurrency: 1,
    rateLimitPerMin: 10,
    maxTacticalConfigs: 10,
  },
  pro: {
    backtestsPerMonth: 5000,
    maxTickers: 50,
    asyncConcurrency: 5,
    rateLimitPerMin: 60,
    maxTacticalConfigs: 100,
  },
  enterprise: {
    backtestsPerMonth: Number.POSITIVE_INFINITY,
    maxTickers: 200,
    asyncConcurrency: 20,
    rateLimitPerMin: 300,
    maxTacticalConfigs: Number.POSITIVE_INFINITY,
  },
};

export interface FlagContext {
  userId?: string;
  orgId?: string;
  plan?: string;
}

/**
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
 * 企业理由（ADR-P1-06）：planLimits 静态表的调整需重新部署；将"是否对某
 * 计划/组织启用增强配额或付费功能"迁移到 Unleash flag 后，可灰度放量、按组织
 * 精准开启，无需发版。此处仅提供 flag 查询入口与命名约定，配额执行仍在
 * middleware/quota.ts，避免侵入式改动破坏既有计费链路。
 */
export const PLAN_LIMIT_FLAGS = {
  /** 启用企业级增强配额（如更高 asyncConcurrency / maxTickers） */
  enterpriseQuota: 'plan.enterprise-quota',
  proAnalytics: 'plan.pro-analytics',
} as const;

export type PlanLimitFlag = (typeof PLAN_LIMIT_FLAGS)[keyof typeof PLAN_LIMIT_FLAGS];

export function isPlanFeatureEnabled(flag: PlanLimitFlag, context?: FlagContext): boolean {
  return isEnabled(flag, context);
}
