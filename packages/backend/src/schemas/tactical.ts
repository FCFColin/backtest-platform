import { z } from 'zod';
import { ALL_REBALANCE_FREQUENCIES, TECHNICAL_INDICATORS } from '@backtest/shared/constants';

export const loginSchema = z.object({
  apiKey: z.string().min(1, 'API Key 不能为空').max(512, 'API Key 过长'),
});

export const loginPasswordSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(100).trim(),
  password: z.string().min(1, '密码不能为空').max(256),
});

export const registerSchema = z.object({
  username: z.string().min(2, '用户名至少2个字符').max(50).trim(),
  email: z.string().email('邮箱格式不正确').max(254).trim().toLowerCase(),
  password: z.string().min(6, '密码至少6个字符').max(256),
  orgName: z.string().max(100).trim().optional(),
});

export const switchOrgSchema = z.object({
  orgId: z.string().min(1, 'orgId 不能为空'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'token 不能为空'),
});

export const resendVerificationSchema = z.object({
  email: z.string().email('邮箱格式不正确').max(254).trim().toLowerCase(),
});

export const createAnnouncementSchema = z.object({
  title: z.string().min(1, 'title 不能为空').max(200),
  body: z.string().min(1, 'body 不能为空').max(10000),
  category: z.string().max(50).optional(),
  severity: z.string().max(50).optional(),
});

export const errorReportSchema = z.object({
  type: z
    .enum(['error', 'vital', 'api_timing', 'component_render', 'page_timing', 'navigation'])
    .optional()
    .default('error'),
  message: z.string().min(1).max(2000).optional(),
  stack: z.string().max(10000).optional(),
  traceId: z.string().max(64).optional(),
  context: z
    .object({
      component: z.string().max(200).optional(),
      action: z.string().max(200).optional(),
      jobId: z.string().max(100).optional(),
    })
    .passthrough()
    .optional(),
  timestamp: z.string().max(50).optional(),
  url: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  value: z.number().optional(),
  metric: z.string().max(64).optional(),
  endpoint: z.string().max(256).optional(),
  route: z.string().max(256).optional(),
  statusCode: z.number().int().optional(),
  component: z.string().max(256).optional(),
  phase: z.string().max(32).optional(),
});

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

// 战术配置 CRUD 校验（P1-1 持久化）
// GET    /api/v1/tactical/configs          — 列表（分页）
// POST   /api/v1/tactical/configs          — 创建
// GET    /api/v1/tactical/configs/:id      — 详情
// PUT    /api/v1/tactical/configs/:id      — 更新
// DELETE /api/v1/tactical/configs/:id      — 删除

export const createTacticalConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  config: z.record(z.string(), z.unknown()),
});

export const updateTacticalConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export type TacticalBacktestRequest = z.infer<typeof tacticalBacktestSchema>;

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
