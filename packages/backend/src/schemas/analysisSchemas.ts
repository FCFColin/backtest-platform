import { z } from 'zod';
import { SIGNAL_TYPES } from '@backtest/shared/constants';

/**
 * 分析/数据类路由共享 Schema（ADR-042 路由整合）。
 * 合并 analysisSchemas / data / shared：非 backtest/tactical 路由的校验 schema 统一在此。
 */

// ── 共享基础 Schema ────────────────────────────────────────────────────────

/** 共享 asset schema，确保 ticker 字段在所有端点校验一致 */
export const assetSchema = z.object({
  ticker: z.string().trim().min(1).max(32),
  weight: z.number().nonnegative(),
});

/** 无请求体的 action 端点校验 schema（接受空/无 body，拒绝含字段的 body） */
export const emptyBodySchema = z.object({}).strict().optional().default({});

/** 分页查询参数（page 默认 1，limit 默认 50 上限 200），供列表类 query schema 复用 */
export const paginationQuerySchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
};

// ── 数据服务路由（/api/v1/data/*）──────────────────────────────────────────

export const historyQuerySchema = z
  .object({
    tickers: z.string().min(1),
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .refine((q) => q.startDate <= q.endDate, {
    message: 'startDate must be before or equal to endDate',
    path: ['endDate'],
  });

export const searchQuerySchema = z.object({
  query: z.string().min(1).max(100),
  market: z.string().max(50).optional(),
});

export const cpiQuerySchema = z.object({
  country: z.enum(['us', 'cn', 'US', 'CN']).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
});

export const tickerListQuerySchema = z.object(paginationQuerySchema);

export const tickerSearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
});

export const customTickerCreateSchema = z.object({
  ticker: z.string().trim().min(1, 'ticker 不能为空').max(50),
  name: z.string().max(200).optional(),
  data: z.array(z.record(z.string(), z.unknown())).min(1, 'data 不能为空').max(10000),
});

// ── 分析类路由（PCA/LETF/goal-optimizer/factor/signal）────────────────────

// POST /api/v1/pca/analyze
export const pcaAnalyzeSchema = z.object({
  tickers: z.array(z.string()).min(2, 'PCA分析至少需要2个资产'),
  startDate: z.string().min(1, '缺少startDate'),
  endDate: z.string().min(1, '缺少endDate'),
  numComponents: z.number().int().positive().optional(),
});

// POST /api/v1/letf/analyze
export const letfAnalyzeSchema = z.object({
  letfTicker: z.string().min(1, '缺少letfTicker'),
  benchmarkTicker: z.string().min(1, '缺少benchmarkTicker'),
  leverage: z.number().positive('leverage必须为正数'),
  startDate: z.string().min(1, '缺少startDate'),
  endDate: z.string().min(1, '缺少endDate'),
});

// POST /api/v1/goal-optimizer/optimize
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

export const factorRegressionSchema = z.object({
  monthlyReturns: z.array(z.number()).min(1, 'monthlyReturns 不能为空'),
  ffData: z.array(z.record(z.string(), z.unknown())).min(1, 'ffData 不能为空'),
  factors: z.array(z.string()).optional(),
  startDate: z.string().max(50).optional(),
  endDate: z.string().max(50).optional(),
});

export const calculatorBodySchema = z.object({}).passthrough().optional().default({});

const signalAnalysisRequestSchema = z.object({
  ticker: z.string().min(1),
  indicator: z.string().min(1),
  period: z.number(),
  threshold: z.number(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  signalType: z.enum(SIGNAL_TYPES),
});

export const signalAnalyzeSchema = signalAnalysisRequestSchema;

export const signalDualSchema = z.object({
  signal1: signalAnalysisRequestSchema,
  signal2: signalAnalysisRequestSchema,
  combinationMethod: z.enum(['and', 'or', 'xor']),
});

export const signalMultiSchema = z.object({
  signals: z.array(signalAnalysisRequestSchema).min(1),
  aggregationMethod: z.enum(['weighted', 'voting', 'rank']),
  weights: z.array(z.number()).optional(),
});
