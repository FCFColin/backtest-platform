/**
 * Ticker 格式校验公共模块
 * 用于防止路径遍历漏洞和子进程注入
 */

/** 合法 ticker 格式正则：支持股票代码(AAPL)、ETF(VTI.BOND)、基金(510300.SH)等
 *  仅允许大写字母、数字、点、下划线、连字符，长度 1-20 */
import { logger } from './logger.js';

export const TICKER_PATTERN = /^[A-Z0-9._-]{1,20}$/;

/** 校验单个 ticker 格式是否合法 */
export function isValidTicker(ticker: string): boolean {
  return typeof ticker === 'string' && TICKER_PATTERN.test(ticker);
}

/** 批量校验 ticker 格式，返回合法与非法列表 */
export function validateTickerFormat(tickers: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const ticker of tickers) {
    if (isValidTicker(ticker)) {
      valid.push(ticker);
    } else {
      invalid.push(ticker);
    }
  }
  if (invalid.length > 0) {
    logger.warn(`[tickerValidation] 过滤非法 ticker: ${invalid.join(', ')}`);
  }
  return { valid, invalid };
}
