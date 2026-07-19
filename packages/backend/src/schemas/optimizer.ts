import { z } from 'zod';

// Validation: 回测优化器路由请求体运行时校验
// 企业为何需要：TypeScript类型仅在编译时检查，运行时req.body可包含任意数据
// 权衡：增加schema定义维护成本，但安全性远高于类型断言

// POST /api/backtest-optimizer/optimize
export const backtestOptimizerSchema = z.object({
  portfolio: z.object({
    name: z.string().optional(),
    assets: z
      .array(
        z.object({
          ticker: z.string().min(1),
          weight: z.number(),
        }),
      )
      .min(1, '组合至少需要一个资产'),
  }),
  parameterSpace: z.object({
    rebalanceFrequencies: z
      .array(z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'none', 'threshold']))
      .min(1),
    rebalanceThreshold: z
      .object({
        min: z.number(),
        max: z.number(),
        step: z.number().positive(),
      })
      .optional(),
    initialCapital: z.object({
      min: z.number(),
      max: z.number(),
      step: z.number().positive(),
    }),
  }),
  parameters: z.object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    benchmarkTicker: z.string().optional(),
    baseCurrency: z.enum(['usd', 'cny']).optional(),
    adjustForInflation: z.boolean().optional(),
  }),
  objective: z.enum(['maxCagr', 'minMaxDrawdown', 'maxSharpe', 'maxSortino']),
  constraints: z
    .object({
      maxDrawdown: z.number().optional(),
      minCagr: z.number().optional(),
    })
    .optional(),
});

import type { BacktestOptimizerRequest } from '../domain/services/optimizer-domain.js';
// Re-export for backward compat (tests / existing imports).
// Domain owns the type contract; Zod schema here provides runtime validation only
// (dependency direction: schemas -> domain, correct per hexagonal architecture).
export type { BacktestOptimizerRequest };
