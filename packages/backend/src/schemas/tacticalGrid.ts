import { z } from 'zod';

// Validation: 战术网格搜索路由请求体运行时校验
// 企业为何需要：TypeScript类型仅在编译时检查，运行时req.body可包含任意数据
// 权衡：增加schema定义维护成本，但安全性远高于类型断言

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
  rebalanceFrequency: z.enum([
    'daily',
    'weekly',
    'monthly',
    'quarterly',
    'annual',
    'none',
    'threshold',
  ]),
  objective: z.enum(['maxCAGR', 'minDrawdown', 'maxSharpe']),
  topN: z.number().int().positive().optional(),
});

export type TacticalGridSearchRequest = z.infer<typeof tacticalGridSearchSchema>;
