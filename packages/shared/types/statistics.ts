/**
 * 统计指标类型定义
 *
 * 包含 100+ 个计算指标，覆盖收益、风险、风险调整后收益、
 * 基准比较、分布特征和提款率分析。
 *
 * 注意：所有字段均为必填，Go引擎总是计算并返回所有指标。
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
 * VaR/CVaR 后缀数字表示置信水平（%），如 varDaily5 = 日频 95% VaR。
 */
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

  var5?: number;
  cvar5?: number;
  varDaily1?: number;
  varDaily5?: number;
  varDaily10?: number;
  varMonthly1?: number;
  varMonthly5?: number;
  varMonthly10?: number;
  varAnnual1?: number;
  varAnnual5?: number;
  varAnnual10?: number;
  cvarDaily1?: number;
  cvarDaily5?: number;
  cvarDaily10?: number;
  cvarMonthly1?: number;
  cvarMonthly5?: number;
  cvarMonthly10?: number;
  cvarAnnual1?: number;
  cvarAnnual5?: number;
  cvarAnnual10?: number;
  skewness: HorizonStats;
  skewnessDaily?: number;
  skewnessMonthly?: number;
  skewnessAnnual?: number;
  excessKurtosis: HorizonStats;
  excessKurtosisDaily?: number;
  excessKurtosisMonthly?: number;
  excessKurtosisAnnual?: number;

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

const ZERO_VAR: { [K in VarLevel]: number } = { 1: 0, 5: 0, 10: 0 };
const ZERO_SKEW: HorizonStats = { daily: 0, monthly: 0, annual: 0 };

const ZERO_NUM_FIELDS = [
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

/**
 * 创建零值 Statistics 骨架（T-24：集中空对象字面量，字段演进只改一处，编译器保证完整性）。
 * @returns 所有必填指标置零的 Statistics 对象
 */
export function createEmptyStatistics(): Statistics {
  return {
    ...(Object.fromEntries(ZERO_NUM_FIELDS.map((k) => [k, 0])) as Record<
      (typeof ZERO_NUM_FIELDS)[number],
      0
    >),
    var: { daily: { ...ZERO_VAR }, monthly: { ...ZERO_VAR }, annual: { ...ZERO_VAR } },
    cvar: { daily: { ...ZERO_VAR }, monthly: { ...ZERO_VAR }, annual: { ...ZERO_VAR } },
    skewness: { ...ZERO_SKEW },
    excessKurtosis: { ...ZERO_SKEW },
    winRate: { ...ZERO_SKEW },
  };
}

/**
 * 将 Statistics 转换为表格组件可消费的扁平 Record<string, number> 视图。
 * 表格组件仅按字符串 key 访问扁平字段（cagr/sharpe/var5 等，未知 key 用 ?? 0 兜底），
 * 本 helper 把类型断言与嵌套→扁平填充集中到单一位置（替代 D6-013 的双重断言）。
 * @param stats - 完整 Statistics 对象（含嵌套对象字段）
 * @returns 表格组件可消费的扁平 Record<string, number> 视图
 */
export function toStatsRecord(stats: Statistics): Record<string, number> {
  const record = stats as unknown as Record<string, number>;
  const HORIZON_CAPS = [
    ['daily', 'Daily'],
    ['monthly', 'Monthly'],
    ['annual', 'Annual'],
  ] as const;
  const LEVELS = [1, 5, 10] as const;
  if (stats.var) {
    for (const [h, cap] of HORIZON_CAPS)
      for (const l of LEVELS) {
        record[`var${cap}${l}`] = stats.var[h]?.[l] ?? 0;
        record[`cvar${cap}${l}`] = stats.cvar?.[h]?.[l] ?? 0;
      }
    record.var5 = stats.var.daily?.[5] ?? 0;
    record.cvar5 = stats.cvar?.daily?.[5] ?? 0;
  }
  for (const [h, cap] of HORIZON_CAPS) {
    if (stats.skewness) record[`skewness${cap}`] = stats.skewness[h] ?? 0;
    if (stats.excessKurtosis) record[`excessKurtosis${cap}`] = stats.excessKurtosis[h] ?? 0;
  }
  return record;
}
