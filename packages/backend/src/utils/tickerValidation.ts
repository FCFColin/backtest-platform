import { logger } from './logger.js';

export const TICKER_PATTERN = /^[A-Z0-9._-]{1,20}$/;

export function isValidTicker(ticker: string): boolean {
  return typeof ticker === 'string' && TICKER_PATTERN.test(ticker);
}

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
