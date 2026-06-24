import { z } from 'zod';

// Validation: 回测路由请求体运行时校验，防止TypeScript类型断言绕过
// 企业为何需要：TypeScript类型仅在编译时检查，运行时req.body可包含任意数据
// 权衡：增加schema定义维护成本，但安全性远高于类型断言

const assetSchema = z.object({
  ticker: z.string().min(1),
  weight: z.number(),
});

const portfolioSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  assets: z.array(assetSchema).min(1),
  rebalanceFrequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'none', 'threshold']),
  rebalanceThreshold: z.number().optional(),
  rebalanceOffset: z.number().optional(),
  drag: z.number().optional(),
  totalReturn: z.boolean().optional(),
  isGlidepath: z.boolean().optional(),
  glidepathFrom: z.string().optional(),
  glidepathTo: z.string().optional(),
  glidepathYears: z.number().optional(),
  glidepathToWeights: z.array(z.number()).optional(),
});

const cashflowLegSchema = z.object({
  id: z.string(),
  amount: z.number(),
  type: z.enum(['contribution', 'withdrawal']),
  frequency: z.enum(['yearly', 'monthly', 'quarterly', 'weekly']),
  offset: z.number(),
  until: z.string().date().optional(),
});

const oneTimeCashflowSchema = z.object({
  id: z.string(),
  amount: z.number(),
  type: z.enum(['contribution', 'withdrawal']),
  date: z.string().date(),
});

const backtestParametersSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  startingValue: z.number().optional(),
  baseCurrency: z.enum(['usd', 'cny']).optional(),
  adjustForInflation: z.boolean().optional(),
  rollingWindowMonths: z.number().optional(),
  benchmarkTicker: z.string().optional(),
  extendedWithdrawalStats: z.boolean().optional(),
  cashflowLegs: z.array(cashflowLegSchema).optional(),
  oneTimeCashflows: z.array(oneTimeCashflowSchema).optional(),
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
export const monteCarloSchema = z.object({
  portfolio: portfolioSchema.optional(),
  portfolios: z.array(portfolioSchema).optional(),
  parameters: backtestParametersSchema,
  mcParams: z.object({
    numSimulations: z.number().optional(),
    blockSize: z.number().optional(),
    withReplacement: z.boolean().optional(),
    confidenceLevel: z.number().optional(),
    distribution: z.string().optional(),
    seed: z.number().optional(),
  }).optional(),
}).refine(
  (data) => data.portfolio || data.portfolios,
  { message: 'Missing required fields: portfolio (or portfolios)' },
);

// POST /api/backtest/optimize
export const optimizeSchema = z.object({
  tickers: z.array(z.string()).min(1),
  objective: z.enum(['maxSharpe', 'minVolatility', 'maxReturn']),
  constraints: z.object({
    minWeight: z.number().optional(),
    maxWeight: z.number().optional(),
  }).optional(),
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
