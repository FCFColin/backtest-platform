/**
 * 数据查询辅助函数 — 日期区间计算 / 行分组 / 搜索校验。
 *
 * 从 dataQuery.ts 拆分（P3-2 M-005）：将无状态辅助函数集中到本文件。
 */
import { logger } from '../utils/logger.js';
import { toDateStr } from '../utils/misc.js';
import { pgCircuitBreaker } from './dataQueryInfrastructure.js';

export function computeIntersection(
  rangeRows: Array<{ first: Date | string; last: Date | string }>,
  defaultStart: string | null,
  defaultEnd: string | null,
): { start: string; end: string } | null {
  let maxStart = defaultStart;
  let minEnd = defaultEnd;
  for (const r of rangeRows) {
    const first = toDateStr(r.first);
    const last = toDateStr(r.last);
    if (!maxStart || first > maxStart) maxStart = first;
    if (!minEnd || last < minEnd) minEnd = last;
  }
  return maxStart && minEnd ? { start: maxStart, end: minEnd } : null;
}

/** 计算 "全部历史" 模式下所有 ticker 的公共日期区间（交集） */
export async function computeCommonDateRange(
  validTickers: string[],
  hasUnknownTickers: boolean,
): Promise<{ start: string; end: string } | null> {
  const { rows: rangeRows } = await pgCircuitBreaker.fire(
    'SELECT ticker, MIN(date) as first, MAX(date) as last FROM prices WHERE ticker = ANY($1) GROUP BY ticker',
    [validTickers],
  );

  if (hasUnknownTickers) {
    return computeIntersection(rangeRows, '2000-01-01', toDateStr(new Date()));
  }

  return computeIntersection(rangeRows, null, null);
}

export function groupRowsByTicker(
  rows: Array<{ ticker: string; date: Date | string; close: number }>,
): Record<string, Record<string, number>> {
  const grouped: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    if (!grouped[row.ticker]) grouped[row.ticker] = {};
    const dateStr = toDateStr(row.date);
    grouped[row.ticker][dateStr] = row.close;
  }
  return grouped;
}

export function validateSearchQuery(query: string, market?: string): boolean {
  if (query.length > 100) {
    logger.warn(`[dataService] searchTickers: query 超过 100 字符限制 (${query.length})`);
    return false;
  }
  if (!/^[\w\s\-.,\u4e00-\u9fff]+$/.test(query)) {
    logger.warn(`[dataService] searchTickers: query 包含非法字符: ${query.slice(0, 50)}`);
    return false;
  }
  if (market) {
    if (market.length > 10) {
      logger.warn(`[dataService] searchTickers: market 超过 10 字符限制 (${market.length})`);
      return false;
    }
    if (!/^[a-zA-Z\u4e00-\u9fff]+$/.test(market)) {
      logger.warn(`[dataService] searchTickers: market 包含非法字符: ${market}`);
      return false;
    }
  }
  return true;
}