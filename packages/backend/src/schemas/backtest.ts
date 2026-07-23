import { z } from 'zod';
import { MAX_TICKERS, ALL_REBALANCE_FREQUENCIES } from '@backtest/shared/constants';
import { TICKER_PATTERN } from '../utils/tickerValidation.js';
import { assetSchema } from './shared.js';

// Validation: 回测路由请求体运行时校验，防止TypeScript类型断言绕过
// 企业为何需要：TypeScript类型仅在编译时检查，运行时req.body可包含任意数据
// 权衡：增加schema定义维护成本，但安全性远高于类型断言

// Security (T-33): 权重为百分比幅度，必须非负；组合级 refine 约束权重和≈100。
const portfolioSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    assets: z.array(assetSchema).min(1),
    rebalanceFrequency: z.enum(ALL_REBALANCE_FREQUENCIES),
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
    {
      message: 'Portfolio weights must sum to approximately 100 (±1 tolerance allowed)',
      path: ['assets'],
    },
  );

// Security (T-14 / A04 业务逻辑校验)：现金流金额为"幅度"，方向由 type 表达。
// 允许 0（空 leg，前端默认值，等价 no-op）与负数（净流出 override，
// 例如将 withdrawal 编码为负幅度）。type 字段仍承担主方向语义。
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

const backtestParametersSchema = z
  .object({
    startDate: z.string().date().or(z.literal('')),
    endDate: z.string().date().or(z.literal('')),
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
  // 空字符串表示"全部历史"，跳过日期范围校验。
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: 'startDate must be before or equal to endDate',
    path: ['endDate'],
  });

// POST /api/backtest/portfolio
export const portfolioBacktestSchema = z.object({
  portfolios: z.array(portfolioSchema).min(1),
  parameters: backtestParametersSchema,
});

/**
 * Ticker 列表 schema：接受字符串数组或逗号/空白分隔的字符串。
 *
 * 自动 transform 为规范化数组（trim + 过滤空值），并 enforce：
 * 1. 至少 1 个 ticker（非空）
 * 2. 数量不超过 {@link MAX_TICKERS}
 * 3. 每个 ticker 符合安全净化格式（{@link TICKER_PATTERN}）
 *
 * 企业理由：3 处路由（/analysis、/optimize、/efficient-frontier）此前各自内联实现
 * `tickers.split(/[\s,]+/)` + `MAX_TICKERS` 检查 + `validateTickers()` 调用，
 * 行为差异容易导致不一致。统一在 schema 层 enforce 后路由只关心业务调用。
 *
 * 输出类型始终为 `string[]`（字符串输入会被 transform 拆分）。
 */
const tickerListSchema = z
  .union([z.array(z.string()), z.string()])
  .transform((val) =>
    (Array.isArray(val) ? val : val.split(/[\s,]+/)).map((t) => t.trim()).filter(Boolean),
  )
  .refine((tickers) => tickers.length > 0, {
    message: 'Tickers cannot be empty',
    path: ['tickers'],
  })
  .refine((tickers) => tickers.length <= MAX_TICKERS, {
    message: `Ticker count exceeds limit (max ${MAX_TICKERS})`,
    path: ['tickers'],
  })
  .superRefine((tickers, ctx) => {
    const invalid = tickers.filter((t) => !TICKER_PATTERN.test(t));
    if (invalid.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid ticker format: ${invalid.join(', ')}`,
        path: ['tickers'],
      });
    }
  });

// POST /api/backtest/analysis
export const analysisSchema = z.object({
  tickers: tickerListSchema,
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
  tickers: tickerListSchema,
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
  tickers: tickerListSchema,
  numPoints: z.number().optional(),
  parameters: backtestParametersSchema,
  riskFreeRate: z.number().optional(),
  numIterations: z.number().optional(),
});

/** POST /api/backtest/portfolio/series — 从 LRU 缓存补全 tab 序列 */
export const portfolioSeriesSchema = portfolioBacktestSchema.extend({
  series: z.array(z.enum(['rollingReturns', 'allocationHistory', 'drawdownEpisodes'])).min(1),
});
