import { z } from 'zod';
import { ALL_REBALANCE_FREQUENCIES, TECHNICAL_INDICATORS } from '@backtest/shared/constants';

// Validation: 战术分配路由请求体运行时校验
// 企业为何需要：TypeScript类型仅在编译时检查，运行时req.body可包含任意数据
// 权衡：增加schema定义维护成本，但安全性远高于类型断言

const signalConditionSchema = z.object({
  indicator: z.enum(TECHNICAL_INDICATORS),
  period: z.number(),
  operator: z.enum(['gt', 'lt', 'cross_above', 'cross_below']),
  threshold: z.number(),
});

const tradingSignalSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  conditions: z.array(signalConditionSchema).min(1),
  targetWeights: z
    .array(
      z.object({
        ticker: z.string().min(1),
        weight: z.number(),
      }),
    )
    .min(1),
});

const tacticalStrategySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  signals: z.array(tradingSignalSchema).min(1),
  aggregationMethod: z.enum(['weighted_average', 'rank', 'voting']),
  rankingConfig: z
    .object({
      method: z.enum(['fixed_share', 'risk_parity']),
      topN: z.number(),
    })
    .optional(),
});

// POST /api/tactical/backtest
export const tacticalBacktestSchema = z.object({
  strategy: tacticalStrategySchema,
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  startingValue: z.number().positive(),
  rebalanceFrequency: z.enum(ALL_REBALANCE_FREQUENCIES),
});

// POST /api/tactical/what-if
export const tacticalWhatIfSchema = z.object({
  tickers: z.array(z.string()).min(1),
  strategy: tacticalStrategySchema.optional(),
  endDate: z.string().date().optional(),
});

// POST /api/tactical/alerts
const emailAlertConfigSchema = z.object({
  enabled: z.boolean(),
  email: z.string().optional(),
  triggers: z.array(z.enum(['signal_change', 'rebalance', 'threshold'])).optional(),
});

export const tacticalAlertSchema = z.object({
  config: emailAlertConfigSchema,
});

export type TacticalBacktestRequest = z.infer<typeof tacticalBacktestSchema>;

// ---------------------------------------------------------------------------
// 战术网格搜索路由请求体校验（POST /api/tactical-grid/search）

const paramRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
});

// POST /api/tactical-grid/search
export const tacticalGridSearchSchema = z.object({
  indicator: z.enum(['sma', 'ema', 'rsi']),
  param1: paramRangeSchema,
  param2: paramRangeSchema,
  tickers: z.array(z.string()).min(1),
  startDate: z.string().min(1).date(),
  endDate: z.string().min(1).date(),
  startingValue: z.number().positive(),
  rebalanceFrequency: z.enum(ALL_REBALANCE_FREQUENCIES),
  objective: z.enum(['maxCAGR', 'minDrawdown', 'maxSharpe']),
  topN: z.number().int().positive().optional(),
});
