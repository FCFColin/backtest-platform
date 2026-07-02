/**
 * Ticker 安全净化层（区别于领域校验层）
 *
 * 职责：防止路径遍历漏洞和子进程注入——这是**安全边界**校验，非领域有效性校验。
 *
 * T-23 两层设计（与 domain/value-objects/ticker.ts 互补，**有意分离，勿合并**）：
 *  - 本模块（宽松）：仅确保 ticker 不含可用于注入/穿越的字符，需兼容数据层实际的
 *    VTI.BOND / 510300.SH 等历史代码，故允许 [A-Z0-9._-] 且长度放宽到 20。
 *  - Ticker VO（DOMAIN_TICKER_PATTERN，严格）：领域规范形态，拒绝下划线/连字符/超长。
 * 详见 ticker.ts 顶部说明。
 */

/** 安全净化正则：仅允许大写字母、数字、点、下划线、连字符，长度 1-20。 */
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
