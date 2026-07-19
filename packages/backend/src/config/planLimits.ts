/**
 * 按计划的资源配额静态配置（ADR-037）
 *
 * 企业理由：SaaS 分层变现与滥用防护的权威来源——每个计划定义月度回测次数、单次最大标的数、
 * 异步任务并发上限与计算端点的每分钟速率上限。配额中间件与限流均以此为准。
 *
 * 设计：仅保留纯静态常量（类型、枚举、配额表）。查表函数与计费周期工具
 * 见 services/planLimitsService.ts，便于单测与多环境覆盖（未来可由 DB/远程配置下发）。
 */

/** 订阅计划标识（与 organizations.plan 对齐） */
type PlanId = 'free' | 'pro' | 'enterprise';

/** 单个计划的配额定义 */
export interface PlanLimits {
  /** 每月可发起的回测/优化计算次数；Infinity 表示不限 */
  backtestsPerMonth: number;
  /** 单次请求允许的最大标的数量 */
  maxTickers: number;
  /** 同一组织同时在跑的异步任务上限（tenant-fair 调度用） */
  asyncConcurrency: number;
  /** 计算端点每分钟速率上限（限流 max） */
  rateLimitPerMin: number;
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
  },
  pro: {
    backtestsPerMonth: 5000,
    maxTickers: 50,
    asyncConcurrency: 5,
    rateLimitPerMin: 60,
  },
  enterprise: {
    backtestsPerMonth: Number.POSITIVE_INFINITY,
    maxTickers: 200,
    asyncConcurrency: 20,
    rateLimitPerMin: 300,
  },
};
