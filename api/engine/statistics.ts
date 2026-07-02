/**
 * 统计指标计算模块（Node.js降级后备）
 * 主引擎为 Go(engine-go, localhost:5004)；本文件作为一致性参照保留，不用于线上降级（ADR-031）。
 * 对应 Go 实现: engine-go/internal/engine (统计指标计算)
 */

import { TRADING_DAYS_PER_YEAR } from '../../shared/constants.js';

/**
 * 计算复合年化增长率 (CAGR)
 * CAGR = (endValue / startValue) ^ (1 / years) - 1
 */
export function calcCAGR(startValue: number, endValue: number, years: number): number {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || !Number.isFinite(years))
    return 0;
  if (startValue <= 0 || endValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * 计算货币加权收益率 (MWRR) - 使用二分法近似内部收益率
 * cashflows: [{value, time}] 其中 value 为正表示投入，为负表示取出，time 为年数
 */
export function calcMWRR(cashflows: Array<{ value: number; time: number }>): number {
  if (cashflows.length === 0) return 0;

  let low = -0.5;
  let high = 1.0;
  const maxIterations = 200;
  const tolerance = 1e-8;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (low + high) / 2;
    let npv = 0;
    for (const cf of cashflows) {
      npv += cf.value / Math.pow(1 + mid, cf.time);
    }
    if (Math.abs(npv) < tolerance) return mid;
    if (npv > 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}

/**
 * 计算年化波动率 (标准差)
 * stdev = std(dailyReturns) * sqrt(252)
 */
export function calcAnnualizedStdev(dailyReturns: number[]): number {
  if (dailyReturns.length < 2) return 0;
  const mean = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
  const variance =
    dailyReturns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (dailyReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * 计算夏普比率
 * sharpe = (cagr - riskFreeRate) / stdev
 */
export function calcSharpe(cagr: number, stdev: number, riskFreeRate = 0.02): number {
  if (stdev === 0) return 0;
  return (cagr - riskFreeRate) / stdev;
}

/**
 * 计算 Sortino 比率
 * sortino = (cagr - riskFreeRate) / downsideDeviation
 * downsideDeviation 使用低于无风险日利率的收益率计算
 */
export function calcSortino(cagr: number, dailyReturns: number[], riskFreeRate = 0.02): number {
  if (dailyReturns.length < 2) return 0;
  const dailyRiskFree = Math.pow(1 + riskFreeRate, 1 / TRADING_DAYS_PER_YEAR) - 1;
  const downsideReturns = dailyReturns.filter((r) => r < dailyRiskFree);
  if (downsideReturns.length === 0) return cagr > riskFreeRate ? Infinity : 0;

  const downsideVariance =
    downsideReturns.reduce((s, r) => s + Math.pow(r - dailyRiskFree, 2), 0) / dailyReturns.length;
  const downsideDeviation = Math.sqrt(downsideVariance) * Math.sqrt(TRADING_DAYS_PER_YEAR);

  if (downsideDeviation === 0) return 0;
  return (cagr - riskFreeRate) / downsideDeviation;
}

/**
 * 计算最大回撤及最大回撤持续时间（天数）
 * 返回 { maxDrawdown, maxDrawdownDuration }
 */
export function calcMaxDrawdown(values: number[]): {
  maxDrawdown: number;
  maxDrawdownDuration: number;
} {
  if (values.length < 2) return { maxDrawdown: 0, maxDrawdownDuration: 0 };

  let peak = values[0];
  let maxDD = 0;
  let maxDDDuration = 0;
  let currentPeakIdx = 0;

  for (let i = 1; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      currentPeakIdx = i;
    }
    const dd = (peak - values[i]) / peak;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDDuration = i - currentPeakIdx;
    }
  }

  return { maxDrawdown: maxDD, maxDrawdownDuration: maxDDDuration };
}

/**
 * 计算皮尔逊相关系数
 */
export function calcCorrelation(returns1: number[], returns2: number[]): number {
  const n = Math.min(returns1.length, returns2.length);
  if (n < 2) return 0;

  const r1 = returns1.slice(0, n);
  const r2 = returns2.slice(0, n);

  const mean1 = r1.reduce((s, v) => s + v, 0) / n;
  const mean2 = r2.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let var1 = 0;
  let var2 = 0;

  for (let i = 0; i < n; i++) {
    const d1 = r1[i] - mean1;
    const d2 = r2[i] - mean2;
    cov += d1 * d2;
    var1 += d1 * d1;
    var2 += d2 * d2;
  }

  if (var1 === 0 || var2 === 0) return 0;
  // 使用样本公式 (n-1) 以与 optimizer.ts 中 calcCovariance 保持一致
  const sampleCov = cov / (n - 1);
  const sampleVar1 = var1 / (n - 1);
  const sampleVar2 = var2 / (n - 1);
  return sampleCov / Math.sqrt(sampleVar1 * sampleVar2);
}

/**
 * 计算日收益率序列
 */
export function calcDailyReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    } else {
      // 前值为0时返回0（爆仓后或从0起始，无有意义收益率）
      returns.push(0);
    }
  }
  return returns;
}

/**
 * 计算总收益率
 * totalReturn = endValue / startValue - 1
 */
export function calcTotalReturn(startValue: number, endValue: number): number {
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return 0;
  if (startValue <= 0) return 0;
  return endValue / startValue - 1;
}

/**
 * 计算最佳年度收益
 */
export function calcBestYear(annualReturns: number[]): number {
  if (annualReturns.length === 0) return 0;
  return Math.max(...annualReturns);
}

/**
 * 计算最差年度收益
 */
export function calcWorstYear(annualReturns: number[]): number {
  if (annualReturns.length === 0) return 0;
  return Math.min(...annualReturns);
}

/**
 * 计算最佳月度收益
 */
export function calcBestMonth(monthlyReturns: number[]): number {
  if (monthlyReturns.length === 0) return 0;
  return Math.max(...monthlyReturns);
}

/**
 * 计算最差月度收益
 */
export function calcWorstMonth(monthlyReturns: number[]): number {
  if (monthlyReturns.length === 0) return 0;
  return Math.min(...monthlyReturns);
}

/**
 * 计算平均回撤深度
 * 遍历净值序列，计算每个时点的回撤，取非零回撤的平均值
 */
export function calcAvgDrawdown(values: number[]): number {
  if (values.length < 2) return 0;
  let peak = values[0];
  let totalDrawdown = 0;
  let drawdownCount = 0;

  for (let i = 1; i < values.length; i++) {
    if (values[i] > peak) peak = values[i];
    if (peak > 0) {
      const dd = (peak - values[i]) / peak;
      if (dd > 0) {
        totalDrawdown += dd;
        drawdownCount++;
      }
    }
  }

  return drawdownCount > 0 ? totalDrawdown / drawdownCount : 0;
}

/**
 * 计算溃疡指数 (Ulcer Index)
 * UI = sqrt(sum(((peak - value) / peak)^2) / n)
 */
export function calcUlcerIndex(values: number[]): number {
  if (values.length < 2) return 0;
  let peak = values[0];
  let sumSquaredDD = 0;

  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) peak = values[i];
    if (peak > 0) {
      const dd = (peak - values[i]) / peak;
      sumSquaredDD += dd * dd;
    }
  }

  return Math.sqrt(sumSquaredDD / values.length);
}

/**
 * 计算卡玛比率 (Calmar Ratio)
 * calmar = cagr / maxDrawdown
 */
export function calcCalmar(cagr: number, maxDrawdown: number): number {
  if (maxDrawdown === 0) return 0;
  return cagr / maxDrawdown;
}

/**
 * 计算溃疡绩效指数 (UPI / Ulcer Performance Index)
 * upi = (cagr - riskFreeRate) / ulcerIndex
 */
export function calcUPI(cagr: number, ulcerIndex: number, riskFreeRate = 0.02): number {
  if (ulcerIndex === 0) return 0;
  return (cagr - riskFreeRate) / ulcerIndex;
}

/**
 * 计算贝塔系数 (Beta)
 * beta = cov(portfolio, benchmark) / var(benchmark)
 */
export function calcBeta(portfolioReturns: number[], benchmarkReturns: number[]): number {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (n < 2) return 0;

  const pr = portfolioReturns.slice(0, n);
  const br = benchmarkReturns.slice(0, n);

  const meanP = pr.reduce((s, v) => s + v, 0) / n;
  const meanB = br.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varB = 0;

  for (let i = 0; i < n; i++) {
    cov += (pr[i] - meanP) * (br[i] - meanB);
    varB += (br[i] - meanB) * (br[i] - meanB);
  }

  if (varB === 0) return 0;
  return cov / varB;
}

/**
 * 计算 Alpha (Jensen's Alpha)
 * alpha = cagr - (riskFreeRate + beta * (benchmarkCagr - riskFreeRate))
 */
export function calcAlpha(
  cagr: number,
  beta: number,
  benchmarkCagr: number,
  riskFreeRate = 0.02,
): number {
  return cagr - (riskFreeRate + beta * (benchmarkCagr - riskFreeRate));
}

/**
 * 计算 R² (决定系数)
 * R² = correlation²
 */
export function calcRSquared(portfolioReturns: number[], benchmarkReturns: number[]): number {
  const corr = calcCorrelation(portfolioReturns, benchmarkReturns);
  return corr * corr;
}

/**
 * 计算跟踪误差 (Tracking Error)
 * TE = std(portfolioReturns - benchmarkReturns) * sqrt(252)
 */
export function calcTrackingError(portfolioReturns: number[], benchmarkReturns: number[]): number {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (n < 2) return 0;

  const diffs: number[] = [];
  for (let i = 0; i < n; i++) {
    diffs.push(portfolioReturns[i] - benchmarkReturns[i]);
  }

  const mean = diffs.reduce((s, v) => s + v, 0) / n;
  const variance = diffs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * 计算信息比率 (Information Ratio)
 * IR = alpha / trackingError
 */
export function calcInformationRatio(alpha: number, trackingError: number): number {
  if (trackingError === 0) return 0;
  return alpha / trackingError;
}

/**
 * 计算上行捕获比 (Upside Capture)
 * 当基准收益为正时，组合收益与基准收益的几何平均之比
 */
export function calcUpsideCapture(portfolioReturns: number[], benchmarkReturns: number[]): number {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (n < 1) return 0;

  let portfolioProduct = 1;
  let benchmarkProduct = 1;
  let count = 0;

  for (let i = 0; i < n; i++) {
    if (benchmarkReturns[i] > 0) {
      portfolioProduct *= 1 + portfolioReturns[i];
      benchmarkProduct *= 1 + benchmarkReturns[i];
      count++;
    }
  }

  if (count === 0 || benchmarkProduct <= 0) return 0;
  const portfolioGeoMean = Math.pow(portfolioProduct, 1 / count) - 1;
  const benchmarkGeoMean = Math.pow(benchmarkProduct, 1 / count) - 1;

  if (benchmarkGeoMean === 0) return 0;
  return portfolioGeoMean / benchmarkGeoMean;
}

/**
 * 计算下行捕获比 (Downside Capture)
 * 当基准收益为负时，组合收益与基准收益的几何平均之比
 */
export function calcDownsideCapture(
  portfolioReturns: number[],
  benchmarkReturns: number[],
): number {
  const n = Math.min(portfolioReturns.length, benchmarkReturns.length);
  if (n < 1) return 0;

  let portfolioProduct = 1;
  let benchmarkProduct = 1;
  let count = 0;

  for (let i = 0; i < n; i++) {
    if (benchmarkReturns[i] < 0) {
      portfolioProduct *= 1 + portfolioReturns[i];
      benchmarkProduct *= 1 + benchmarkReturns[i];
      count++;
    }
  }

  if (count === 0 || benchmarkProduct <= 0) return 0;
  const portfolioGeoMean = Math.pow(portfolioProduct, 1 / count) - 1;
  const benchmarkGeoMean = Math.pow(benchmarkProduct, 1 / count) - 1;

  if (benchmarkGeoMean === 0) return 0;
  return portfolioGeoMean / benchmarkGeoMean;
}

/**
 * 计算在险价值 (Value at Risk) - 历史模拟法
 * confidence: 如 0.95 表示 95% 置信度，返回正值表示损失
 */
export function calcVaR(dailyReturns: number[], confidence: number): number {
  if (dailyReturns.length < 2) return 0;
  const sorted = [...dailyReturns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidence) * sorted.length);
  return -sorted[Math.max(0, index)];
}

/**
 * 计算条件在险价值 (CVaR / Expected Shortfall)
 * 置信度之外尾部收益的平均损失，返回正值表示损失
 */
export function calcCVaR(dailyReturns: number[], confidence: number): number {
  if (dailyReturns.length < 2) return 0;
  const sorted = [...dailyReturns].sort((a, b) => a - b);
  const cutoffIndex = Math.floor((1 - confidence) * sorted.length);
  if (cutoffIndex === 0) return -sorted[0];
  const tailReturns = sorted.slice(0, cutoffIndex);
  const avg = tailReturns.reduce((s, v) => s + v, 0) / tailReturns.length;
  return -avg;
}

/**
 * 计算偏度 (Skewness)
 * 使用样本偏度校正公式
 */
export function calcSkewness(returns: number[]): number {
  const n = returns.length;
  if (n < 3) return 0;

  const mean = returns.reduce((s, v) => s + v, 0) / n;
  const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
  if (variance === 0) return 0;

  const stdev = Math.sqrt(variance);
  const sumCubed = returns.reduce((s, v) => s + Math.pow((v - mean) / stdev, 3), 0);

  return (n / ((n - 1) * (n - 2))) * sumCubed;
}

/**
 * 计算超额峰度 (Excess Kurtosis)
 * 使用 Fisher's 校正公式
 */
export function calcExcessKurtosis(returns: number[]): number {
  const n = returns.length;
  if (n < 4) return 0;

  const mean = returns.reduce((s, v) => s + v, 0) / n;
  const variance = returns.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
  if (variance === 0) return 0;

  const stdev = Math.sqrt(variance);
  const sumFourth = returns.reduce((s, v) => s + Math.pow((v - mean) / stdev, 4), 0);

  return (
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sumFourth -
    (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3))
  );
}

/**
 * 计算永续提款率 (PWR - Perpetual Withdrawal Rate)
 * 使用二分查找：找到最大年化提款率，使得组合在给定年度收益序列下不会耗尽
 *
 * @param annualReturns - 年度收益率序列（小数形式，如 0.04 表示 4%）
 * @returns PWR（小数形式，如 0.04 表示 4%）
 */
export function calcPWR(annualReturns: number[]): number {
  if (annualReturns.length === 0) return 0;

  let low = 0;
  let high = 1; // 最大搜索 100% 提款率
  const maxIterations = 100;
  const tolerance = 1e-8;

  for (let iter = 0; iter < maxIterations; iter++) {
    const mid = (low + high) / 2;
    if (simulateWithdrawal(annualReturns, mid)) {
      low = mid; // 能持续，尝试更高提款率
    } else {
      high = mid; // 不能持续，降低提款率
    }
    if (high - low < tolerance) break;
  }

  return low;
}

/**
 * 模拟给定提款率下组合是否不会耗尽
 * 初始值为 1，每年初提取 withdrawalRate，然后应用年度收益
 */
function simulateWithdrawal(annualReturns: number[], withdrawalRate: number): boolean {
  let portfolio = 1.0;
  for (const ret of annualReturns) {
    portfolio = portfolio * (1 + ret) - withdrawalRate;
    if (portfolio <= 0) return false;
  }
  return true;
}
