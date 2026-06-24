/**
 * @file 技术指标计算服务
 * @description 提供统一的技术指标计算实现，包括 SMA、EMA、RSI、MACD、Bollinger、Momentum 等常用指标。
 *
 * 约定：
 * - 所有函数返回 `number[]`，长度与输入 `prices` 一致
 * - 无效值（数据不足、除零等）统一用 `NaN` 表示
 * - 调用方如需 `null` 语义，可在外层做 `isNaN` 转换
 */

/**
 * 计算简单移动平均（SMA）
 * @param prices 价格序列
 * @param period 周期
 * @returns SMA 值序列，不足周期处为 NaN
 */
export function calcSMA(prices: number[], period: number): number[] {
  const result: number[] = new Array(prices.length).fill(NaN);
  if (period <= 0) return result;
  let sum = 0;
  for (let i = 0; i < prices.length; i++) {
    sum += prices[i];
    if (i >= period) sum -= prices[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }
  return result;
}

/**
 * 计算指数移动平均（EMA）
 *
 * 初始化方式：以 `prices[0]` 作为种子值，从第一个价格开始递推。
 * @param prices 价格序列
 * @param period 周期
 * @returns EMA 值序列，空输入或非正周期时全为 NaN
 */
export function calcEMA(prices: number[], period: number): number[] {
  const result: number[] = new Array(prices.length).fill(NaN);
  if (prices.length === 0 || period <= 0) return result;
  const mult = 2 / (period + 1);
  result[0] = prices[0];
  for (let i = 1; i < prices.length; i++) {
    result[i] = prices[i] * mult + result[i - 1] * (1 - mult);
  }
  return result;
}

/**
 * 计算相对强弱指数（RSI）
 *
 * 使用 Wilder 平滑法：avgGain/avgLoss 按 (prev*(period-1)+current)/period 递推。
 * @param prices 价格序列
 * @param period 周期，通常为 14
 * @returns RSI 值序列（0-100），不足周期处为 NaN
 */
export function calcRSI(prices: number[], period: number): number[] {
  const result: number[] = new Array(prices.length).fill(NaN);
  if (prices.length <= period || period <= 0) return result;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

/**
 * 计算 MACD 指标
 *
 * MACD = EMA(fast) - EMA(slow)
 * Signal = EMA(MACD, signalPeriod)
 * Histogram = MACD - Signal
 * @param prices 价格序列
 * @param fastPeriod 快线周期，默认 12
 * @param slowPeriod 慢线周期，默认 26
 * @param signalPeriod 信号线周期，默认 9
 * @returns 包含 macd、signal、histogram 三个序列
 */
export function calcMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = calcEMA(prices, fastPeriod);
  const emaSlow = calcEMA(prices, slowPeriod);
  const macd = prices.map((_, i) => emaFast[i] - emaSlow[i]);
  const signal = calcEMA(macd, signalPeriod);
  const histogram = macd.map((val, i) => val - signal[i]);
  return { macd, signal, histogram };
}

/**
 * 计算布林带（中轨 SMA，上下轨 ±mult 倍标准差）
 * @param prices 价格序列
 * @param period 周期，默认 20
 * @param mult 标准差倍数，默认 2
 * @returns 包含 upper、middle、lower 三个序列
 */
export function calcBollinger(
  prices: number[],
  period: number = 20,
  mult: number = 2,
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = calcSMA(prices, period);
  const upper: number[] = new Array(prices.length).fill(NaN);
  const lower: number[] = new Array(prices.length).fill(NaN);
  for (let i = period - 1; i < prices.length; i++) {
    if (isNaN(middle[i])) continue;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (prices[j] - middle[i]) ** 2;
    }
    const std = Math.sqrt(variance / period);
    upper[i] = middle[i] + mult * std;
    lower[i] = middle[i] - mult * std;
  }
  return { upper, middle, lower };
}

/**
 * 计算布林带 %B 指标
 *
 * %B = (price - lower) / (upper - lower)
 * 0 = 处于下轨，1 = 处于上轨，0.5 = 处于中轨。
 * 上下轨重合时返回 0.5 以避免除零。
 * @param prices 价格序列
 * @param period 周期，默认 20
 * @param mult 标准差倍数，默认 2
 * @returns %B 值序列，不足周期处为 NaN
 */
export function calcBollingerPctB(
  prices: number[],
  period: number = 20,
  mult: number = 2,
): number[] {
  const { upper, lower } = calcBollinger(prices, period, mult);
  const result: number[] = new Array(prices.length).fill(NaN);
  for (let i = 0; i < prices.length; i++) {
    if (isNaN(upper[i]) || isNaN(lower[i])) continue;
    result[i] = upper[i] !== lower[i] ? (prices[i] - lower[i]) / (upper[i] - lower[i]) : 0.5;
  }
  return result;
}

/**
 * 计算动量指标
 *
 * Momentum = (price / price_n_ago - 1) * 100，即 n 周期百分比收益。
 * @param prices 价格序列
 * @param period 周期
 * @returns 动量值序列（百分比），不足周期或基准价为 0 处为 NaN
 */
export function calcMomentum(prices: number[], period: number): number[] {
  const result: number[] = new Array(prices.length).fill(NaN);
  if (period <= 0) return result;
  for (let i = period; i < prices.length; i++) {
    if (prices[i - period] !== 0) {
      result[i] = (prices[i] / prices[i - period] - 1) * 100;
    }
  }
  return result;
}
