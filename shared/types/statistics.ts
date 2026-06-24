// 统计指标类型定义

/** 统计指标 */
export interface Statistics {
  // 核心收益
  cagr: number;
  mwrr: number;
  totalReturn?: number;
  bestYear: number;
  worstYear: number;
  avgYear: number;
  avgAnnualReturn?: number;
  avgMonthlyReturn?: number;
  avgDailyReturn?: number;

  // 波动率
  stdev: number;
  stdevAnnual?: number;
  stdevMonthly?: number;
  stdevMonthlyRaw?: number;
  stdevDaily?: number;
  stdevDailyRaw?: number;

  // 下行偏差
  downsideDeviation?: number;
  downsideDeviationDailyRaw?: number;
  downsideDeviationMonthly?: number;
  downsideDeviationMonthlyRaw?: number;
  downsideDeviationAnnual?: number;

  // 回撤
  maxDrawdown: number;
  maxDrawdownDuration: number;
  avgDrawdown?: number;
  ulcerIndex?: number;
  drawdownRecoveryFactor?: number;

  // 风险调整
  sharpe: number;
  sortino: number;
  calmar?: number;
  ulcerPerformanceIndex?: number;
  diversificationRatio?: number;
  m2?: number;

  // 基准相关
  alpha?: number;
  beta?: number;
  rSquared?: number;
  treynor?: number;
  benchmarkCorrelation?: number;
  upsideCorrelation?: number;
  downsideCorrelation?: number;
  upsideBeta?: number;
  downsideBeta?: number;
  alphaDaily?: number;
  alphaAnnualized?: number;

  // 捕获率
  upsideCapture?: number;
  downsideCapture?: number;
  upsideCaptureDaily?: number;
  downsideCaptureDaily?: number;
  upsideCaptureAnnual?: number;
  downsideCaptureAnnual?: number;
  captureSpread?: number;
  captureSpreadDaily?: number;
  captureSpreadAnnual?: number;

  // 主动管理
  activeReturn?: number;
  trackingError?: number;
  informationRatio?: number;

  // VaR / CVaR
  var5?: number;
  cvar5?: number;
  varDaily1?: number;
  varDaily5?: number;
  varDaily10?: number;
  cvarDaily1?: number;
  cvarDaily5?: number;
  cvarDaily10?: number;
  varMonthly1?: number;
  varMonthly5?: number;
  varMonthly10?: number;
  cvarMonthly1?: number;
  cvarMonthly5?: number;
  cvarMonthly10?: number;
  varAnnual1?: number;
  varAnnual5?: number;
  varAnnual10?: number;
  cvarAnnual1?: number;
  cvarAnnual5?: number;
  cvarAnnual10?: number;

  // 分布特征
  skewness?: number;
  excessKurtosis?: number;
  skewnessDaily?: number;
  skewnessMonthly?: number;
  skewnessAnnual?: number;
  excessKurtosisDaily?: number;
  excessKurtosisMonthly?: number;
  excessKurtosisAnnual?: number;

  // 正收益比例
  pctPositiveDays?: number;
  pctPositiveMonths?: number;
  pctPositiveYears?: number;

  // 极值收益
  maxDailyReturn?: number;
  minDailyReturn?: number;
  maxMonthlyReturn?: number;
  minMonthlyReturn?: number;
  maxAnnualReturn?: number;
  minAnnualReturn?: number;

  // 平均盈亏 & 盈亏比
  avgDailyGain?: number;
  avgDailyLoss?: number;
  gainLossRatioDaily?: number;
  avgMonthlyGain?: number;
  avgMonthlyLoss?: number;
  gainLossRatioMonthly?: number;
  avgAnnualGain?: number;
  avgAnnualLoss?: number;
  gainLossRatioAnnual?: number;

  // 提款率
  swr?: number;
  pwr?: number;
  swr10y?: number;
  pwr10y?: number;
  swr20y?: number;
  pwr20y?: number;
  swr30y?: number;
  pwr30y?: number;
  swr40y?: number;
  pwr40y?: number;
}

/** 提款统计 */
export interface WithdrawalStats {
  swr: number;
  pwr: number;
  perpetualRate: number;
}
