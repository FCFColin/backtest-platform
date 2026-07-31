/**
 * 市场数据统计 — 纯辅助函数（从 marketStats.ts 拆分，P3-2 M-005）。
 * 无副作用纯函数集中于此便于单测与复用；所有 DB 查询函数保留在 marketStats.ts。
 */
import type {
  DbMarketStats,
  TickerAggRow,
  ProcessTickerRowOpts,
  MarketStatsAccumulators,
} from './marketStatsTypes.js';

/** 字节数 → MB（保留 1 位小数）。 */
export function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

// 市场代码 / 类型 / 交易所推断

/** 根据 ticker 后缀或显式市场字段推断市场代码（CN / US）。 */
export function inferMarket(ticker: string, market: string): string {
  if (market) return market.toUpperCase();
  // 同时支持点号（000001.SZ）与下划线（000001_SZ）后缀，修复 A 股计数为 0 的 bug（Task 5.1）
  if (/[._](SZ|SS|SH)$/i.test(ticker)) return 'CN';
  return 'US';
}

/** 按 ticker 后缀推导交易所代码（与 Go provider.DeriveExchange 保持一致）。 */
export function deriveExchangeFromTicker(ticker: string): string {
  if (/[._]SZ$/i.test(ticker)) return 'SZSE';
  if (/[._](SS|SH)$/i.test(ticker)) return 'SSE';
  return 'US';
}

/** 根据 category 推断 ticker 类型（ETF / INDEX / STOCK）。 */
export function inferType(category: string): string {
  const c = (category || '').toUpperCase();
  if (c.includes('ETF')) return 'ETF';
  if (c.includes('INDEX')) return 'INDEX';
  return 'STOCK';
}

/** 首日日期 → 年代标签（如 1990s）；解析失败返回 'unknown'。 */
export function decadeLabel(firstDate: string): string {
  const y = parseInt(firstDate.slice(0, 4), 10);
  if (Number.isNaN(y)) return 'unknown';
  return `${Math.floor(y / 10) * 10}s`;
}

/** 首末日期 → 5 年跨度桶标签（如 "5-9年"）。 */
function yearBucket(firstDate: string, lastDate: string): string {
  const startY = parseInt(firstDate.slice(0, 4), 10);
  const endY = parseInt((lastDate || firstDate).slice(0, 4), 10);
  const lo = Math.floor((endY - startY) / 5) * 5;
  return `${lo}-${lo + 4}年`;
}

const SAMPLE_KEY_MAP: Array<[string, string, string]> = [
  ['US', 'STOCK', 'us_stock'],
  ['US', 'ETF', 'us_etf'],
  ['CN', 'STOCK', 'cn_stock'],
  ['CN', 'ETF', 'cn_etf'],
];
/** 判断样本 ticker 的分类键；不匹配返回空串。 */
function categorizeSampleKey(market: string, ttype: string): string {
  for (const [m, t, key] of SAMPLE_KEY_MAP) if (market === m && ttype === t) return key;
  return ttype === 'INDEX' ? 'index' : '';
}

// 年代 / 年限 / 维度统计累加

/** 累计年代与年限桶统计，返回该 ticker 跨度年限。 */
export function accumulateYearStats(
  firstDate: string,
  lastDate: string,
  byDecade: Record<string, number>,
  byYearCount: Record<string, number>,
): { years: number } {
  byDecade[decadeLabel(firstDate)] = (byDecade[decadeLabel(firstDate)] || 0) + 1;
  const bucket = yearBucket(firstDate, lastDate);
  byYearCount[bucket] = (byYearCount[bucket] || 0) + 1;
  return { years: parseInt(lastDate.slice(0, 4), 10) - parseInt(firstDate.slice(0, 4), 10) };
}

/** 更新市场/类型/交易所统计累加器。 */
export function updateMarketStats(
  market: string,
  ttype: string,
  exchange: string,
  acc: MarketStatsAccumulators,
): void {
  const { byMarket, byType, byExchange } = acc;
  if (!byMarket[market]) byMarket[market] = { count: 0, stocks: 0, etfs: 0, indices: 0 };
  byMarket[market].count++;
  if (ttype === 'STOCK') byMarket[market].stocks++;
  else if (ttype === 'ETF') byMarket[market].etfs++;
  else if (ttype === 'INDEX') byMarket[market].indices++;
  byType[ttype] = (byType[ttype] || 0) + 1;
  // 使用真实交易所代码替代原硬编码空键，修复"未知"分布（Task 4.3）
  byExchange[exchange] = (byExchange[exchange] || 0) + 1;
}

/** 更新日期范围与年限覆盖率统计。 */
function updateDateRangeStats(
  firstDate: string,
  lastDate: string,
  byDecade: Record<string, number>,
  byYearCount: Record<string, number>,
  state: {
    earliest: string | null;
    latest: string | null;
    tickers5y: number;
    tickers10y: number;
    tickers20y: number;
  },
): void {
  if (!firstDate) return;
  if (!state.earliest || firstDate < state.earliest) state.earliest = firstDate;
  if (!state.latest || lastDate > state.latest) state.latest = lastDate;
  const { years } = accumulateYearStats(firstDate, lastDate, byDecade, byYearCount);
  if (years >= 5) state.tickers5y++;
  if (years >= 10) state.tickers10y++;
  if (years >= 20) state.tickers20y++;
}

/** 处理单行 ticker 聚合数据，更新统计累加器。 */
export function processTickerRow(opts: ProcessTickerRowOpts): void {
  const { row, byMarket, byType, byExchange, byDecade, byYearCount, sampleTickers, state } = opts;
  const market = inferMarket(row.ticker, row.market);
  const ttype = inferType(row.category);
  // 优先 DB 的 tickers.exchange 列；为空时由 ticker 后缀兜底推导（Task 4.3）
  const exchange = row.exchange || deriveExchangeFromTicker(row.ticker);
  const nPoints = row.n_points;
  const firstDate = row.first_date || '';
  const lastDate = row.last_date || '';
  state.totalDataPoints += nPoints;
  state.allPoints.push(nPoints);
  updateMarketStats(market, ttype, exchange, { byMarket, byType, byExchange });
  updateDateRangeStats(firstDate, lastDate, byDecade, byYearCount, state);
  const sampleKey = categorizeSampleKey(market, ttype);
  if (sampleKey && sampleTickers[sampleKey as keyof typeof sampleTickers].length < 5) {
    sampleTickers[sampleKey as keyof typeof sampleTickers].push({
      ticker: row.ticker,
      name: row.category || row.ticker,
      first_date: firstDate,
      last_date: lastDate,
      data_points: nPoints,
    });
  }
}

/** 构建市场统计结果对象（DbMarketStats 快照）。 */
export function buildMarketStatsResult(args: {
  rows: TickerAggRow[];
  byMarket: DbMarketStats['by_market'];
  byType: Record<string, number>;
  byExchange: Record<string, number>;
  byDecade: Record<string, number>;
  byYearCount: Record<string, number>;
  sampleTickers: DbMarketStats['sample_tickers'];
  state: {
    earliest: string | null;
    latest: string | null;
    tickers5y: number;
    tickers10y: number;
    tickers20y: number;
    totalDataPoints: number;
  };
  allPoints: number[];
  storageBytes: number;
}): DbMarketStats {
  const {
    rows,
    byMarket,
    byType,
    byExchange,
    byDecade,
    byYearCount,
    sampleTickers,
    state,
    allPoints,
    storageBytes,
  } = args;
  const avgPoints =
    allPoints.length > 0 ? Math.round(allPoints.reduce((a, b) => a + b, 0) / allPoints.length) : 0;
  const sorted = [...allPoints].sort((a, b) => a - b);
  const medianPoints = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
  return {
    generated_at: new Date().toISOString(),
    total_cached: rows.length,
    by_market: byMarket,
    by_type: byType,
    by_exchange: byExchange,
    date_ranges: { earliest: state.earliest, latest: state.latest },
    by_decade: byDecade,
    by_year_count: byYearCount,
    coverage: {
      tickers_with_5y_plus: state.tickers5y,
      tickers_with_10y_plus: state.tickers10y,
      tickers_with_20y_plus: state.tickers20y,
      avg_data_points: avgPoints,
      median_data_points: medianPoints,
    },
    data_quality: {
      with_adj_close: rows.length,
      with_dividends: 0,
      with_splits: 0,
      total_data_points: state.totalDataPoints,
      total_size_mb: bytesToMb(storageBytes),
    },
    recent_updates: [],
    sample_tickers: sampleTickers,
  };
}
