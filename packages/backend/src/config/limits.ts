/**
 * 计划配额、特性开关与安全检查（ADR-037 / ADR-P1-06 / P0-02）。
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

interface FlagContext {
  userId?: string;
  orgId?: string;
  plan?: string;
}

// Unleash 未初始化时返回 false（fail-closed）
export function isEnabled(flagName: string, context?: FlagContext): boolean {
  if (!unleashClient?.isInitialized) return false;
  return unleashClient.isEnabled(flagName, {
    userId: context?.userId,
    properties: { orgId: context?.orgId, plan: context?.plan },
  });
}

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

export const PLAN_LIMIT_FLAGS = {
  /** 启用企业级增强配额（如更高 asyncConcurrency / maxTickers） */
  enterpriseQuota: 'plan.enterprise-quota',
  proAnalytics: 'plan.pro-analytics',
} as const;
