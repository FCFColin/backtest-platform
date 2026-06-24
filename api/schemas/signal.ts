import { z } from 'zod';

// Validation: 信号分析路由请求体运行时校验
// 企业为何需要：TypeScript类型仅在编译时检查，运行时req.body可包含任意数据
// 权衡：增加schema定义维护成本，但安全性远高于类型断言

const signalAnalysisRequestSchema = z.object({
  ticker: z.string().min(1),
  indicator: z.string().min(1),
  period: z.number(),
  threshold: z.number(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  signalType: z.enum(['entry', 'exit', 'both']),
});

// POST /api/signal/analyze
export const signalAnalyzeSchema = signalAnalysisRequestSchema;

// POST /api/signal/dual
export const signalDualSchema = z.object({
  signal1: signalAnalysisRequestSchema,
  signal2: signalAnalysisRequestSchema,
  combinationMethod: z.enum(['and', 'or', 'xor']),
});

// POST /api/signal/multi
export const signalMultiSchema = z.object({
  signals: z.array(signalAnalysisRequestSchema).min(1),
  aggregationMethod: z.enum(['weighted', 'voting', 'rank']),
  weights: z.array(z.number()).optional(),
});

export type SignalAnalyzeRequest = z.infer<typeof signalAnalyzeSchema>;
export type SignalDualRequest = z.infer<typeof signalDualSchema>;
export type SignalMultiRequest = z.infer<typeof signalMultiSchema>;
