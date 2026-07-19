/**
 * 价格数据校验共享工具
 *
 * P0 消除重复代码：6+ 个应用服务中重复实现"检查 ticker 是否有价格数据"逻辑，
 * 每处实现略有差异（错误消息不同、检查条件不同），导致行为不一致。
 * 本模块集中维护校验逻辑，确保所有服务使用一致的检查标准。
 */

import { DataNotFoundError, ValidationError } from '../../utils/errors.js';

/**
 * 检查单个 ticker 是否有有效的价格数据。
 *
 * "有效"指 priceData 中存在该 ticker 且其日期-价格映射非空。
 *
 * @param priceData - 价格数据映射
 * @param ticker - 待检查的标的代码
 * @returns true 如果有有效数据
 */
function hasPriceData(priceData: Record<string, Record<string, number>>, ticker: string): boolean {
  return !!priceData[ticker] && Object.keys(priceData[ticker]).length > 0;
}

/**
 * 批量检查多个 ticker 是否都有价格数据，缺失时抛出 DataNotFoundError。
 *
 * 消除 6+ 处重复的 missingTickers 检查模式：
 * ```ts
 * const missing = tickers.filter(t => !priceData[t] || Object.keys(priceData[t]).length === 0);
 * if (missing.length > 0) throw new DataNotFoundError(...);
 * ```
 *
 * @param tickers - 需要检查的标的代码列表
 * @param priceData - 价格数据映射
 * @param context - 可选的错误上下文描述（如 "PCA 分析"），用于错误消息
 * @throws {DataNotFoundError} 当存在缺失价格数据的 ticker 时
 */
export function ensurePriceDataExists(
  tickers: string[],
  priceData: Record<string, Record<string, number>>,
  context?: string,
): void {
  const missing = tickers.filter((t) => !hasPriceData(priceData, t));
  if (missing.length > 0) {
    const prefix = context ? `[${context}] ` : '';
    throw new DataNotFoundError(`${prefix}以下资产未找到价格数据: ${missing.join(', ')}`);
  }
}

/**
 * 检查单个 ticker 是否有价格数据，缺失时抛出 DataNotFoundError。
 *
 * @param ticker - 待检查的标的代码
 * @param priceData - 价格数据映射
 * @param label - 可选的标的标签（如 "杠杆 ETF"），用于错误消息
 * @throws {DataNotFoundError} 当该 ticker 无价格数据时
 */
export function ensureTickerHasData(
  ticker: string,
  priceData: Record<string, Record<string, number>>,
  label?: string,
): void {
  if (!hasPriceData(priceData, ticker)) {
    const prefix = label ? `${label} ` : '';
    throw new DataNotFoundError(`未找到 ${prefix}${ticker} 的价格数据`);
  }
}

/**
 * 规范化 ticker 列表：去空白、转大写、去重、过滤空值。
 *
 * 消除 4+ 处重复的 normalize 模式。
 *
 * @param tickers - 原始 ticker 列表
 * @returns 规范化后的去重 ticker 列表
 */
export function normalizeTickers(tickers: string[]): string[] {
  return Array.from(new Set(tickers.map((t) => String(t).trim().toUpperCase()).filter(Boolean)));
}

/**
 * 检查有效交易日是否充足，不足时抛出 ValidationError。
 *
 * @param dates - 交易日列表
 * @param minCount - 最少需要的交易日数
 * @param context - 可选的上下文描述
 * @throws {ValidationError} 当交易日数不足时
 */
export function ensureSufficientTradingDays(
  dates: string[],
  minCount: number,
  context?: string,
): void {
  if (dates.length < minCount) {
    const prefix = context ? `[${context}] ` : '';
    throw new ValidationError(
      `${prefix}有效交易日不足（${dates.length}/${minCount}），无法运行回测`,
    );
  }
}
