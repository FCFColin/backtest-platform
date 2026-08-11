export const TICKER_PATTERN = /^[A-Z0-9._-]{1,20}$/;

export function isValidTicker(ticker: string): boolean {
  return typeof ticker === 'string' && TICKER_PATTERN.test(ticker);
}
