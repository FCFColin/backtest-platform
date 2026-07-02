/**
 * 统计指标类型定义
 *
 * 包含 60+ 个计算指标，覆盖收益、风险、风险调整后收益、
 * 基准比较、分布特征和提款率分析。
 *
 * 注意：cagr 和 mwrr 是必填字段（引擎始终返回），
 * 其余字段按需计算（取决于回测参数中的 extendedWithdrawalStats 等选项）。
 */

/**
 * 回测统计指标集合
 *
 * 各频率后缀约定：
 * - 无后缀：年化（默认）
 * - Daily：日频指标
 * - Monthly：月频指标
 * - Annual/Annualized：年化（与无后缀等价）
 * - Raw：原始（未年化）指标
 *
 * VaR/CVaR 后缀数字表示置信水平（%），如 var5 = 95% VaR。
 */
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

  // 下行偏差（仅考虑负收益的标准差）
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

  // 捕获率（组合收益 vs 基准收益的比例）
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

  // VaR / CVaR（不同时间维度 × 不同置信水平）
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

  // 分布特征（偏度和超额峰度）
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

  // 提款率（SWR = 安全提款率，PWR = 永久提款率）
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

/**
 * 提款统计
 *
 * swr（Safe Withdrawal Rate）：在指定期限内不耗尽资金的最大初始提款率。
 * pwr（Perpetual Withdrawal Rate）：本金永不减少的最大提款率。
 * perpetualRate：理论上可永久持续的最高提款率（接近 pwr）。
 */
export interface WithdrawalStats {
  swr: number;
  pwr: number;
  perpetualRate: number;
}

/**
 * 创建零值 Statistics 骨架（T-24：消除重复的空统计对象字面量）。
 *
 * 企业为何需要：数据不足/计算失败时需返回一个全零的 Statistics 占位。此前该骨架在
 * 引擎多处以对象字面量重复书写，新增统计字段时极易漏改某一处导致类型不一致。集中为
 * 单一工厂后，字段演进只需改一处，编译器保证完整性。
 *
 * @returns 所有必填指标置零的 Statistics 对象
 */
export function createEmptyStatistics(): Statistics {
  return {
    cagr: 0,
    mwrr: 0,
    stdev: 0,
    sharpe: 0,
    sortino: 0,
    maxDrawdown: 0,
    maxDrawdownDuration: 0,
    bestYear: 0,
    worstYear: 0,
    avgYear: 0,
    totalReturn: 0,
    maxMonthlyReturn: 0,
    minMonthlyReturn: 0,
    avgDrawdown: 0,
    ulcerIndex: 0,
    calmar: 0,
    ulcerPerformanceIndex: 0,
    beta: 0,
    alpha: 0,
    rSquared: 0,
    trackingError: 0,
    informationRatio: 0,
    upsideCapture: 0,
    downsideCapture: 0,
    var5: 0,
    cvar5: 0,
    skewness: 0,
    excessKurtosis: 0,
    pctPositiveDays: 0,
    maxDailyReturn: 0,
    minDailyReturn: 0,
  };
}
