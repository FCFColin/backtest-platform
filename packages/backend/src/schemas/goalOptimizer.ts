import { z } from 'zod';

// Validation: 目标优化路由请求体运行时校验
// 企业为何需要：TypeScript类型仅在编译时检查，运行时req.body可包含任意数据
// 权衡：增加schema定义维护成本，但安全性远高于类型断言

// POST /api/goal-optimizer/optimize
export const goalOptimizerSchema = z.object({
  targetAmount: z.number().positive('targetAmount必须为正数'),
  initialAmount: z.number().positive('initialAmount必须为正数'),
  years: z.number().positive('years必须为正数'),
  assets: z
    .array(
      z.object({
        ticker: z.string().min(1),
        weight: z.number(),
      }),
    )
    .min(1, 'assets不能为空'),
  constraints: z
    .object({
      maxDrawdown: z.number().optional(),
      minSuccessRate: z.number().optional(),
      maxVolatility: z.number().optional(),
    })
    .optional(),
  numSimulations: z.number().int().positive().optional(),
});
