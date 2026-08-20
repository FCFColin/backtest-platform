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
  captureSpread: number;

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

type NonObjectKeys = {
  [K in keyof Statistics]-?: Statistics[K] extends number | undefined
    ? undefined extends Statistics[K]
      ? never
      : K
    : never;
}[keyof Statistics];

const ZERO_FIELDS: Record<NonObjectKeys, 0> = {
  cagr: 0,
  mwrr: 0,
  totalReturn: 0,
  bestYear: 0,
  worstYear: 0,
  avgYear: 0,
  avgAnnualReturn: 0,
  avgMonthlyReturn: 0,
  avgDailyReturn: 0,
  stdev: 0,
  stdevAnnual: 0,
  stdevMonthly: 0,
  stdevMonthlyRaw: 0,
  stdevDaily: 0,
  stdevDailyRaw: 0,
  downsideDeviation: 0,
  downsideDeviationDailyRaw: 0,
  downsideDeviationMonthly: 0,
  downsideDeviationMonthlyRaw: 0,
  downsideDeviationAnnual: 0,
  maxDrawdown: 0,
  maxDrawdownDuration: 0,
  avgDrawdown: 0,
  ulcerIndex: 0,
  drawdownRecoveryFactor: 0,
  sharpe: 0,
  sortino: 0,
  calmar: 0,
  ulcerPerformanceIndex: 0,
  diversificationRatio: 0,
  m2: 0,
  treynor: 0,
  alpha: 0,
  beta: 0,
  rSquared: 0,
  benchmarkCorrelation: 0,
  upsideCorrelation: 0,
  downsideCorrelation: 0,
  upsideBeta: 0,
  downsideBeta: 0,
  alphaDaily: 0,
  alphaAnnualized: 0,
  upsideCapture: 0,
  downsideCapture: 0,
  captureSpread: 0,
  activeReturn: 0,
  trackingError: 0,
  informationRatio: 0,
  pctPositiveDays: 0,
  pctPositiveMonths: 0,
  pctPositiveYears: 0,
  maxDailyReturn: 0,
  minDailyReturn: 0,
  maxMonthlyReturn: 0,
  minMonthlyReturn: 0,
  maxAnnualReturn: 0,
  minAnnualReturn: 0,
  avgDailyGain: 0,
  avgDailyLoss: 0,
  gainLossRatioDaily: 0,
  avgMonthlyGain: 0,
  avgMonthlyLoss: 0,
  gainLossRatioMonthly: 0,
  avgAnnualGain: 0,
  avgAnnualLoss: 0,
  gainLossRatioAnnual: 0,
  swr: 0,
  pwr: 0,
  swr10y: 0,
  pwr10y: 0,
  swr20y: 0,
  pwr20y: 0,
  swr30y: 0,
  pwr30y: 0,
  swr40y: 0,
  pwr40y: 0,
};

export function createEmptyStatistics(): Statistics {
  return {
    ...ZERO_FIELDS,
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
    record.varAnnual1 = stats.var.annual?.[1] ?? 0;
    record.varAnnual5 = stats.var.annual?.[5] ?? 0;
    record.cvarAnnual1 = stats.cvar?.annual?.[1] ?? 0;
    record.cvarAnnual5 = stats.cvar?.annual?.[5] ?? 0;
  }
  if (stats.skewness) record.skewnessDaily = stats.skewness.daily ?? 0;
  if (stats.excessKurtosis) record.excessKurtosisDaily = stats.excessKurtosis.daily ?? 0;
  record.negativeMonthsPct = 1 - stats.pctPositiveMonths;
  return record;
}
