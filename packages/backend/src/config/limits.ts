import { unleashClient } from '../infrastructure/unleashClient.js';
import { logger } from '../utils/logger.js';

type PlanId = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  backtestsPerMonth: number;
  maxTickers: number;
  asyncConcurrency: number;
  rateLimitPerMin: number;
  maxTacticalConfigs: number;
}

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

// fail-closed
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
  enterpriseQuota: 'plan.enterprise-quota',
  proAnalytics: 'plan.pro-analytics',
} as const;
