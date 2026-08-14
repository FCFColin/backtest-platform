export const TICKER_PATTERN = /^[A-Z0-9._-]{1,20}$/;

// 与 data-fetcher IsValidTicker 保持一致：拒绝 .. 及路径分隔符，防止跨语言校验漂移
export function isValidTicker(ticker: string): boolean {
  if (typeof ticker !== 'string' || ticker.length > 20) return false;
  if (ticker.includes('..') || /[/\\]/.test(ticker)) return false;
  return TICKER_PATTERN.test(ticker);
}
