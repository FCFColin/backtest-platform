import { z } from 'zod';

/**
 * 分析类路由共享 Schema（ADR-042 路由整合）
 *
 * 合并原独立文件 pca.ts / letf.ts / goalOptimizer.ts，
 * 三者均仅被 analysisRoutes.ts 导入，合并消除 3 个独立文件的维护开销。
 */

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

/** POST /api/v1/analysis/factor-regression — 请求体校验 */
export const factorRegressionSchema = z.object({
  monthlyReturns: z.array(z.number()).min(1, 'monthlyReturns 不能为空'),
  ffData: z.array(z.record(z.string(), z.unknown())).min(1, 'ffData 不能为空'),
  factors: z.array(z.string()).optional(),
  startDate: z.string().max(50).optional(),
  endDate: z.string().max(50).optional(),
});

/** POST /api/v1/calculators/:type — body 因 type 而异，校验为对象即可 */
export const calculatorBodySchema = z
  .object({})
  .passthrough()
  .optional()
  .default({});
