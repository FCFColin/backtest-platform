type PlanId = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  backtestsPerMonth: number;
  maxTickers: number;
  asyncConcurrency: number;
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
    maxTacticalConfigs: 10,
  },
  pro: {
    backtestsPerMonth: 5000,
    maxTickers: 50,
    asyncConcurrency: 5,
    maxTacticalConfigs: 100,
  },
  enterprise: {
    backtestsPerMonth: Number.POSITIVE_INFINITY,
    maxTickers: 200,
    asyncConcurrency: 20,
    maxTacticalConfigs: Number.POSITIVE_INFINITY,
  },
};
