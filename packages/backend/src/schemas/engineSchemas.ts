// 引擎响应契约 schema（ADR-031 配套）：与 engine-go/internal/**/types.go 字段保持同步，
// 由 callEngineStrict 在返回 data 前做 safeParse，Go 侧改名/改型时在此 fail-closed 暴露。
import { z } from 'zod';

const num = z.number();
const str = z.string();

const dataPointSchema = z.object({ date: str, value: num });
const drawdownPointSchema = z.object({ date: str, drawdown: num });
const annualReturnSchema = z.object({ year: z.number().int(), return: num });
const monthlyReturnSchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  return: num,
});
const rollingReturnSchema = z.object({ date: str, return: num });
const weightEntrySchema = z.object({ ticker: str, weight: num });

// Statistics 巨型结构：钉住结构骨架与关键指标，其余数值字段透传
const varLevelsSchema = z.object({ 1: num, 5: num, 10: num });
const varByFrequencySchema = z.object({
  daily: varLevelsSchema,
  monthly: varLevelsSchema,
  annual: varLevelsSchema,
});
const freqStatsSchema = z.object({ daily: num, monthly: num, annual: num });

export const statisticsSchema = z
  .object({
    cagr: num,
    mwrr: num,
    stdev: num,
    sharpe: num,
    sortino: num,
    maxDrawdown: num,
    maxDrawdownDuration: z.number().int(),
    bestYear: num,
    worstYear: num,
    avgYear: num,
    totalReturn: num,
    calmar: num,
    alpha: num,
    beta: num,
    rSquared: num,
    trackingError: num,
    informationRatio: num,
    upsideCapture: num,
    downsideCapture: num,
    pwr: num,
    swr: num,
    var: varByFrequencySchema,
    cvar: varByFrequencySchema,
    skewness: freqStatsSchema,
    excessKurtosis: freqStatsSchema,
    winRate: freqStatsSchema,
  })
  .passthrough();

const drawdownEpisodeSchema = z.object({
  peakDate: str,
  troughDate: str,
  depth: num,
  totalTimeDurationDays: z.number().int(),
  recoveryDate: str.optional(),
  timeToTrough: z.number().int().optional(),
  recoveryTime: z.number().int().optional(),
  recoveryFactor: num.optional(),
  cagrDuring: num.optional(),
  ulcerDuring: num.optional(),
  returnFromPeakToTrough: num.optional(),
  returnFromTroughToRecovery: num.nullable().optional(),
});

// 引擎可返回 nil 切片（JSON null，如 tactical 仅填 growthCurve/statistics），故数组可空
const portfolioResultSchema = z.object({
  name: str,
  growthCurve: z.array(dataPointSchema).nullable(),
  drawdownCurve: z.array(drawdownPointSchema).nullable(),
  rollingReturns: z.array(rollingReturnSchema).nullable(),
  annualReturns: z.array(annualReturnSchema).nullable(),
  monthlyReturns: z.array(monthlyReturnSchema).nullable(),
  statistics: statisticsSchema,
  drawdownEpisodes: z.array(drawdownEpisodeSchema).nullable(),
  allocationHistory: z.array(z.object({ date: str, weights: z.array(num) })).nullable(),
});

export const backtestResultSchema = z.object({
  portfolios: z.array(portfolioResultSchema),
  correlations: z.array(z.array(num)),
  benchmarkGrowth: z.array(dataPointSchema).nullable(),
  assetTickers: z.array(str).nullable(),
  assetCorrelations: z.array(z.array(num)).nullable(),
});

const assetAnalysisItemSchema = z.object({
  ticker: str,
  growthCurve: z.array(dataPointSchema).nullable(),
  drawdownCurve: z.array(drawdownPointSchema).nullable(),
  dailyReturns: z.array(num).nullable(),
  annualReturns: z.array(annualReturnSchema).nullable(),
  monthlyReturns: z.array(monthlyReturnSchema).nullable(),
  rollingReturns: z.array(rollingReturnSchema).nullable(),
  statistics: statisticsSchema,
});

export const analysisResultSchema = z.object({
  assets: z.array(assetAnalysisItemSchema),
  correlations: z.array(z.array(num)),
});

export const pcaResultSchema = z.object({
  eigenvalues: z.array(num),
  cumulativeVariance: z.array(num),
  loadings: z.array(z.array(num)),
  scores: z.array(z.array(num)),
  tickers: z.array(str),
});

export const letfResultSchema = z.object({
  slippageCurve: z.array(z.object({ date: str, slippage: num })),
  annualDecay: num,
  effectiveLeverage: z.array(num.nullable()),
  stats: z.object({
    benchmarkReturn: num,
    letfReturn: num,
    expectedReturn: num,
    slippage: num,
  }),
});

export const goalOptimizeResultSchema = z.object({
  successProbability: num,
  probabilityCurve: z.array(z.object({ amount: num, probability: num })),
  optimalPath: z.array(z.object({ year: z.number().int(), median: num, p10: num, p90: num })),
  recommendation: z.object({
    expectedReturn: num,
    requiredContribution: num,
    successRate: num,
  }),
});

export const optimizeResultSchema = z.object({
  optimalWeights: z.record(str, num),
  expectedReturn: num,
  expectedVolatility: num,
  sharpeRatio: num,
});

export const frontierResultSchema = z.object({
  frontier: z.array(
    z.object({
      weights: z.record(str, num),
      expectedReturn: num,
      expectedVolatility: num,
      sharpeRatio: num,
    }),
  ),
});

export const monteCarloResultSchema = z.object({
  percentiles: z.object({
    p5: z.array(num),
    p10: z.array(num),
    p25: z.array(num),
    p50: z.array(num),
    p75: z.array(num),
    p90: z.array(num),
    p95: z.array(num),
  }),
  successProbability: z.array(num),
  finalDistribution: z.array(num),
  statistics: z.object({ medianFinalValue: num, meanFinalValue: num, successRate: num }),
  perPathMetrics: z.array(
    z.object({
      finalValue: num,
      cagr: num,
      maxDrawdown: num,
      volatility: num,
      sharpe: num,
      sortino: num,
    }),
  ),
  representativePaths: z.object({
    best: z.array(num),
    p25: z.array(num),
    median: z.array(num),
    p75: z.array(num),
    worst: z.array(num),
  }),
  successProbabilities: z.object({
    survival: z.array(num),
    capitalPreservation: z.array(num),
    profit: z.array(num),
  }),
});

const gridCombinationMetricsSchema = z.object({
  param1: num,
  param2: num,
  cagr: num,
  maxDrawdown: num,
  sharpe: num,
  totalReturn: num,
  stdev: num,
  calmar: num,
});
const topCombinationResultSchema = gridCombinationMetricsSchema.extend({
  growthCurve: z.array(dataPointSchema),
});

export const tacticalGridResultSchema = z.object({
  totalCombinations: z.number().int(),
  allMetrics: z.array(gridCombinationMetricsSchema),
  topResults: z.array(topCombinationResultSchema),
  heatmap: z.object({
    param1Label: str,
    param2Label: str,
    param1Values: z.array(num),
    param2Values: z.array(num),
    matrix: z.array(z.array(num.nullable())),
    objective: str,
  }),
  bestCombination: topCombinationResultSchema.nullable(),
});

const signalDirSchema = z.enum(['buy', 'sell']);
const signalPointSchema = z.object({ date: str, type: signalDirSchema, price: num });
const signalStatsSchema = z.object({
  totalSignals: z.number().int(),
  winRate: num,
  avgReturn: num,
  maxDrawdown: num,
  sharpe: num,
});
const signalAnalysisResultSchema = z.object({
  signals: z.array(signalPointSchema),
  statistics: signalStatsSchema,
  equityCurve: z.array(z.object({ date: str, value: num })),
});

export const signalResultSchema = {
  single: signalAnalysisResultSchema,
  dual: z.object({
    signal1: signalAnalysisResultSchema,
    signal2: signalAnalysisResultSchema,
    combined: signalAnalysisResultSchema,
    comparison: z.array(
      z.object({
        date: str,
        signal1: signalDirSchema.nullable(),
        signal2: signalDirSchema.nullable(),
        combined: signalDirSchema.nullable(),
      }),
    ),
  }),
  multi: z.object({
    aggregated: signalAnalysisResultSchema,
    contributions: z.array(
      z.object({
        index: z.number().int(),
        indicator: str,
        contribution: num,
        statistics: signalStatsSchema,
      }),
    ),
  }),
};

export const factorRegressionResultSchema = z.object({
  alpha: num,
  beta: num,
  smb: num,
  hml: num,
  rSquared: num,
  residuals: z.array(num),
});

export const calculatorResultSchema = {
  cagr: z.object({ cagr: num, totalReturn: num, multiplier: num }),
  swr: z.object({
    successRate: num,
    minPortfolio: num,
    maxPortfolio: num,
    safeWithdrawal: num,
  }),
  frontier: z.array(z.object({ weight1: num, weight2: num, return: num, stdev: num })),
};

export const tacticalBacktestResultSchema = z.object({
  portfolio: portfolioResultSchema,
  signalHistory: z.array(
    z.object({
      date: str,
      activeSignals: z.array(str),
      weights: z.array(weightEntrySchema),
    }),
  ),
});
