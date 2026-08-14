import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { MAX_TICKERS, ALL_REBALANCE_FREQUENCIES } from '@backtest/shared/constants';
import { TICKER_PATTERN } from '../utils/tickerValidation.js';
import { assetSchema } from './analysisSchemas.js';
import type { BacktestOptimizerRequest } from '../domain/services/optimizer-domain.js';

extendZodWithOpenApi(z);

// z.unknown() 会渲染成无效 JSON Schema {nullable:true}（无 type，严格 ajv 拒绝编译）；object+additionalProperties 兼容 OpenAPI 3.0
export const anyJsonSchema = z.unknown().openapi({ type: 'object', additionalProperties: true });

const portfolioSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    assets: z.array(assetSchema).min(1),
    rebalanceFrequency: z.enum(ALL_REBALANCE_FREQUENCIES),
    rebalanceThreshold: z.number().optional(),
    rebalanceOffset: z.number().optional(),
    rebalanceBands: z
      .object({
        enabled: z.boolean(),
        absoluteBand: z.number().optional(),
        relativeBand: z.number().optional(),
      })
      .optional(),
    drag: z.number().optional(),
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

const cashflowLegSchema = z.object({
  id: z.string(),
  amount: z.number(),
  type: z.enum(['contribution', 'withdrawal']),
  frequency: z.enum(['yearly', 'monthly', 'quarterly', 'weekly']),
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
    startingValue: z.number().positive().optional(),
    baseCurrency: z.enum(['usd', 'cny']).optional(),
    adjustForInflation: z.boolean().optional(),
    rollingWindowMonths: z.number().int().positive().optional(),
    benchmarkTicker: z.string().optional(),
    cashflowLegs: z.array(cashflowLegSchema).optional(),
    oneTimeCashflows: z.array(oneTimeCashflowSchema).optional(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.startDate <= data.endDate, {
    message: 'startDate must be before or equal to endDate',
    path: ['endDate'],
  });

export const portfolioBacktestSchema = z.object({
  portfolios: z.array(portfolioSchema).min(1),
  parameters: backtestParametersSchema,
});

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

export const analysisSchema = z.object({
  tickers: tickerListSchema,
  parameters: backtestParametersSchema,
});

export const monteCarloSchema = z
  .object({
    portfolio: portfolioSchema.optional(),
    portfolios: z.array(portfolioSchema).optional(),
    parameters: backtestParametersSchema,
    mcParams: z
      .object({
        numSimulations: z.number().optional(),
        numYears: z.number().optional(),
        minBlockYears: z.number().optional(),
        maxBlockYears: z.number().optional(),
        successThreshold: z.number().optional(),
        seed: z.number().optional(),
      })
      .optional(),
  })
  .refine((data) => data.portfolio || data.portfolios, {
    message: 'Missing required fields: portfolio (or portfolios)',
  });

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
  numIterations: z.number().optional(),
});

export const efficientFrontierSchema = z.object({
  tickers: tickerListSchema,
  numPoints: z.number().optional(),
  parameters: backtestParametersSchema,
  numIterations: z.number().optional(),
});

export const portfolioSeriesSchema = portfolioBacktestSchema.extend({
  series: z.array(z.enum(['rollingReturns', 'allocationHistory', 'drawdownEpisodes'])).min(1),
});

export const portfolioBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  assets: z.array(assetSchema).min(1).max(200),
  rebalanceFrequency: z.enum(ALL_REBALANCE_FREQUENCIES).optional(),
});

export const savedConfigBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  config: z.record(z.string(), anyJsonSchema),
});

export const backtestRunBodySchema = z.object({
  name: z.string().trim().max(120).optional(),
  request: z.record(z.string(), anyJsonSchema),
  result: anyJsonSchema.optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
});

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
    rebalanceFrequencies: z.array(z.enum(ALL_REBALANCE_FREQUENCIES)).min(1),
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

export type { BacktestOptimizerRequest };
