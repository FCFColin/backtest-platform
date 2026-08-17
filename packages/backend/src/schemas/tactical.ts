import { z } from 'zod';
import { ALL_REBALANCE_FREQUENCIES, TECHNICAL_INDICATORS } from '@backtest/shared/constants';
import { tickerWeightSchema } from './analysisSchemas.js';

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
  targetWeights: z.array(tickerWeightSchema).min(1),
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

export const tacticalBacktestSchema = z.object({
  strategy: tacticalStrategySchema,
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  startingValue: z.number().positive(),
  rebalanceFrequency: z.enum(ALL_REBALANCE_FREQUENCIES),
});

export const tacticalWhatIfSchema = z.object({
  tickers: z.array(z.string()).min(1),
  strategy: tacticalStrategySchema.optional(),
  endDate: z.string().date().optional(),
});

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

export const paramRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
});

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
