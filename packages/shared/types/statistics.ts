type VarLevel = 1 | 5 | 10;
type HorizonStats = { daily: number; monthly: number; annual: number };
type VaRByHorizon = { [H in 'daily' | 'monthly' | 'annual']: { [K in VarLevel]: number } };

export type Statistics = {
  cagr: number;
  mwrr: number;
  totalReturn: number;
  bestYear: number;
  worstYear: number;
  avgYear: number;
  avgAnnualReturn: number;
  avgMonthlyReturn: number;
  avgDailyReturn: number;

  stdev: number;
  stdevAnnual: number;
  stdevMonthly: number;
  stdevMonthlyRaw: number;
  stdevDaily: number;
  stdevDailyRaw: number;

  downsideDeviation: number;
  downsideDeviationDailyRaw: number;
  downsideDeviationMonthly: number;
  downsideDeviationMonthlyRaw: number;
  downsideDeviationAnnual: number;

  maxDrawdown: number;
  maxDrawdownDuration: number;
  avgDrawdown: number;
  ulcerIndex: number;
  drawdownRecoveryFactor: number;

  sharpe: number;
  sortino: number;
  calmar: number;
  ulcerPerformanceIndex: number;
  diversificationRatio: number;
  m2: number;
  treynor: number;

  alpha: number;
  beta: number;
  rSquared: number;
  benchmarkCorrelation: number;
  upsideCorrelation: number;
  downsideCorrelation: number;
  upsideBeta: number;
  downsideBeta: number;
  alphaDaily: number;
  alphaAnnualized: number;

  upsideCapture: number;
  downsideCapture: number;
  upsideCaptureDaily: number;
  downsideCaptureDaily: number;
  upsideCaptureAnnual: number;
  downsideCaptureAnnual: number;
  captureSpread: number;
  captureSpreadDaily: number;
  captureSpreadAnnual: number;

  activeReturn: number;
  trackingError: number;
  informationRatio: number;

  var: VaRByHorizon;
  cvar: VaRByHorizon;

  varDaily5?: number;
  cvarDaily5?: number;
  skewness: HorizonStats;
  skewnessDaily?: number;
  excessKurtosis: HorizonStats;
  excessKurtosisDaily?: number;

  winRate: HorizonStats;
  pctPositiveDays: number;
  pctPositiveMonths: number;
  pctPositiveYears: number;

  maxDailyReturn: number;
  minDailyReturn: number;
  maxMonthlyReturn: number;
  minMonthlyReturn: number;
  maxAnnualReturn: number;
  minAnnualReturn: number;

  avgDailyGain: number;
  avgDailyLoss: number;
  gainLossRatioDaily: number;
  avgMonthlyGain: number;
  avgMonthlyLoss: number;
  gainLossRatioMonthly: number;
  avgAnnualGain: number;
  avgAnnualLoss: number;
  gainLossRatioAnnual: number;

  swr: number;
  pwr: number;
  swr10y: number;
  pwr10y: number;
  swr20y: number;
  pwr20y: number;
  swr30y: number;
  pwr30y: number;
  swr40y: number;
  pwr40y: number;
};

const ZERO_VAR: { [K in VarLevel]: number } = { 1: 0, 5: 0, 10: 0 };
const ZERO_SKEW: HorizonStats = { daily: 0, monthly: 0, annual: 0 };

const NUM_FIELDS = [
  'cagr',
  'mwrr',
  'totalReturn',
  'bestYear',
  'worstYear',
  'avgYear',
  'avgAnnualReturn',
  'avgMonthlyReturn',
  'avgDailyReturn',
  'stdev',
  'stdevAnnual',
  'stdevMonthly',
  'stdevMonthlyRaw',
  'stdevDaily',
  'stdevDailyRaw',
  'downsideDeviation',
  'downsideDeviationDailyRaw',
  'downsideDeviationMonthly',
  'downsideDeviationMonthlyRaw',
  'downsideDeviationAnnual',
  'maxDrawdown',
  'maxDrawdownDuration',
  'avgDrawdown',
  'ulcerIndex',
  'drawdownRecoveryFactor',
  'sharpe',
  'sortino',
  'calmar',
  'ulcerPerformanceIndex',
  'diversificationRatio',
  'm2',
  'treynor',
  'alpha',
  'beta',
  'rSquared',
  'benchmarkCorrelation',
  'upsideCorrelation',
  'downsideCorrelation',
  'upsideBeta',
  'downsideBeta',
  'alphaDaily',
  'alphaAnnualized',
  'upsideCapture',
  'downsideCapture',
  'upsideCaptureDaily',
  'downsideCaptureDaily',
  'upsideCaptureAnnual',
  'downsideCaptureAnnual',
  'captureSpread',
  'captureSpreadDaily',
  'captureSpreadAnnual',
  'activeReturn',
  'trackingError',
  'informationRatio',
  'pctPositiveDays',
  'pctPositiveMonths',
  'pctPositiveYears',
  'maxDailyReturn',
  'minDailyReturn',
  'maxMonthlyReturn',
  'minMonthlyReturn',
  'maxAnnualReturn',
  'minAnnualReturn',
  'avgDailyGain',
  'avgDailyLoss',
  'gainLossRatioDaily',
  'avgMonthlyGain',
  'avgMonthlyLoss',
  'gainLossRatioMonthly',
  'avgAnnualGain',
  'avgAnnualLoss',
  'gainLossRatioAnnual',
  'swr',
  'pwr',
  'swr10y',
  'pwr10y',
  'swr20y',
  'pwr20y',
  'swr30y',
  'pwr30y',
  'swr40y',
  'pwr40y',
] as const;

export function createEmptyStatistics(): Statistics {
  return {
    ...(Object.fromEntries(NUM_FIELDS.map((k) => [k, 0])) as Record<
      (typeof NUM_FIELDS)[number],
      0
    >),
    var: { daily: { ...ZERO_VAR }, monthly: { ...ZERO_VAR }, annual: { ...ZERO_VAR } },
    cvar: { daily: { ...ZERO_VAR }, monthly: { ...ZERO_VAR }, annual: { ...ZERO_VAR } },
    skewness: { ...ZERO_SKEW },
    excessKurtosis: { ...ZERO_SKEW },
    winRate: { ...ZERO_SKEW },
  };
}

export function toStatsRecord(stats: Statistics): Record<string, number> {
  const record = stats as unknown as Record<string, number>;
  if (stats.var) {
    record.varDaily5 = stats.var.daily?.[5] ?? 0;
    record.cvarDaily5 = stats.cvar?.daily?.[5] ?? 0;
  }
  if (stats.skewness) record.skewnessDaily = stats.skewness.daily ?? 0;
  if (stats.excessKurtosis) record.excessKurtosisDaily = stats.excessKurtosis.daily ?? 0;
  return record;
}
