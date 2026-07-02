import { z } from 'zod';

// Validation: 回测路由请求体运行时校验，防止TypeScript类型断言绕过
// 企业为何需要：TypeScript类型仅在编译时检查，运行时req.body可包含任意数据
// 权衡：增加schema定义维护成本，但安全性远高于类型断言

// Security (T-33): 权重为百分比幅度，必须非负；组合级 refine 约束权重和≈100。
const assetSchema = z.object({
  ticker: z.string().min(1),
  weight: z.number().nonnegative('weight 必须为非负数'),
});

const portfolioSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    assets: z.array(assetSchema).min(1),
    rebalanceFrequency: z.enum([
      'daily',
      'weekly',
      'monthly',
      'quarterly',
      'annual',
      'none',
      'threshold',
    ]),
    rebalanceThreshold: z.number().optional(),
    rebalanceOffset: z.number().optional(),
    drag: z.number().optional(),
    totalReturn: z.boolean().optional(),
    isGlidepath: z.boolean().optional(),
    glidepathFrom: z.string().optional(),
    glidepathTo: z.string().optional(),
    glidepathYears: z.number().optional(),
    glidepathToWeights: z.array(z.number()).optional(),
  })
  .refine(
    (p) => {
      const sum = p.assets.reduce((acc, a) => acc + a.weight, 0);
      return Math.abs(sum - 100) <= 1;
    },
    { message: '组合资产权重之和应约为 100（允许 ±1 容差）', path: ['assets'] },
  );

// Security (T-14 / A04 业务逻辑校验)：现金流金额为"幅度"，方向由 type 表达，
// 负数金额无业务含义且可能引发计算异常，故约束为正数。
const cashflowLegSchema = z.object({
  id: z.string(),
  amount: z.number().positive(),
  type: z.enum(['contribution', 'withdrawal']),
  frequency: z.enum(['yearly', 'monthly', 'quarterly', 'weekly']),
  offset: z.number(),
  until: z.string().date().optional(),
});

const oneTimeCashflowSchema = z.object({
  id: z.string(),
  amount: z.number().positive(),
  type: z.enum(['contribution', 'withdrawal']),
  date: z.string().date(),
});

const backtestParametersSchema = z
  .object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    // 初始本金必须为正（负/零本金会导致收益率除零或无意义结果）。
    startingValue: z.number().positive().optional(),
    baseCurrency: z.enum(['usd', 'cny']).optional(),
    adjustForInflation: z.boolean().optional(),
    rollingWindowMonths: z.number().int().positive().optional(),
    benchmarkTicker: z.string().optional(),
    extendedWithdrawalStats: z.boolean().optional(),
    cashflowLegs: z.array(cashflowLegSchema).optional(),
    oneTimeCashflows: z.array(oneTimeCashflowSchema).optional(),
  })
  // Security (T-14)：日期区间必须 start <= end。否则下游产生空/倒序序列，
  // 轻则空结果，重则数组越界或被用于构造异常输入。ISO YYYY-MM-DD 可直接字典序比较。
  .refine((data) => data.startDate <= data.endDate, {
    message: 'startDate 必须早于或等于 endDate',
    path: ['endDate'],
  });

// POST /api/backtest/portfolio
export const portfolioBacktestSchema = z.object({
  portfolios: z.array(portfolioSchema).min(1),
  parameters: backtestParametersSchema,
});

// POST /api/backtest/analysis
export const analysisSchema = z.object({
  tickers: z.union([z.array(z.string()).min(1), z.string().min(1)]),
  parameters: backtestParametersSchema,
});

// POST /api/backtest/monte-carlo
export const monteCarloSchema = z
  .object({
    portfolio: portfolioSchema.optional(),
    portfolios: z.array(portfolioSchema).optional(),
    parameters: backtestParametersSchema,
    mcParams: z
      .object({
        numSimulations: z.number().optional(),
        blockSize: z.number().optional(),
        withReplacement: z.boolean().optional(),
        confidenceLevel: z.number().optional(),
        distribution: z.string().optional(),
        seed: z.number().optional(),
      })
      .optional(),
  })
  .refine((data) => data.portfolio || data.portfolios, {
    message: 'Missing required fields: portfolio (or portfolios)',
  });

// POST /api/backtest/optimize
export const optimizeSchema = z.object({
  tickers: z.array(z.string()).min(1),
  objective: z.enum(['maxSharpe', 'minVolatility', 'maxReturn']),
  constraints: z
    .object({
      minWeight: z.number().optional(),
      maxWeight: z.number().optional(),
    })
    .optional(),
  parameters: backtestParametersSchema,
  riskFreeRate: z.number().optional(),
  numIterations: z.number().optional(),
});

// POST /api/backtest/efficient-frontier
export const efficientFrontierSchema = z.object({
  tickers: z.array(z.string()).min(1),
  numPoints: z.number().optional(),
  parameters: backtestParametersSchema,
  riskFreeRate: z.number().optional(),
  numIterations: z.number().optional(),
});

export type PortfolioBacktestRequest = z.infer<typeof portfolioBacktestSchema>;
export type AnalysisRequest = z.infer<typeof analysisSchema>;
export type MonteCarloRequest = z.infer<typeof monteCarloSchema>;
export type OptimizeRequest = z.infer<typeof optimizeSchema>;
export type EfficientFrontierRequest = z.infer<typeof efficientFrontierSchema>;

/** POST /api/backtest/portfolio/series — 从 LRU 缓存补全 tab 序列 */
export const portfolioSeriesSchema = portfolioBacktestSchema.extend({
  series: z.array(z.enum(['rollingReturns', 'allocationHistory', 'drawdownEpisodes'])).min(1),
});
export type PortfolioSeriesRequest = z.infer<typeof portfolioSeriesSchema>;
