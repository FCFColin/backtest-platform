/**
 * 市场数据统计 — 从 PostgreSQL 聚合市场数据统计（替代 JSON 文件扫描）。
 *
 * 合并自 marketStatsHelpers.ts + marketStorageStats.ts + marketStats.ts。
 */
import { getReadPool } from './pool.js';
import { logger } from '../utils/logger.js';
import type { MarketStats } from '@backtest/shared/types';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type DbMarketStats = MarketStats;

/** ticker 聚合行（来自 PostgreSQL 查询） */
export interface TickerAggRow {
  ticker: string;
  market: string;
  category: string;
  exchange: string;
  n_points: number;
  first_date: string | null;
  last_date: string | null;
}

/** processTickerRow 的累加器状态 */
export interface TickerRowState {
  earliest: string | null;
  latest: string | null;
  tickers5y: number;
  tickers10y: number;
  tickers20y: number;
  totalDataPoints: number;
  allPoints: number[];
}

/** processTickerRow 的全部参数 */
export interface ProcessTickerRowOpts {
  row: TickerAggRow;
  byMarket: DbMarketStats['by_market'];
  byType: Record<string, number>;
  byExchange: Record<string, number>;
  byDecade: Record<string, number>;
  byYearCount: Record<string, number>;
  sampleTickers: DbMarketStats['sample_tickers'];
  state: TickerRowState;
}

/**
 * 按维度分组的统计累加器（updateMarketStats 用）。
 *
 * 将 byMarket / byType / byExchange 三个累加器聚合为单一对象，降至 4 个参数。
 */
export interface MarketStatsAccumulators {
  byMarket: DbMarketStats['by_market'];
  byType: Record<string, number>;
  byExchange: Record<string, number>;
}

// ---------------------------------------------------------------------------
// 表空间占用统计
// ---------------------------------------------------------------------------

const MARKET_DATA_TABLES = ['tickers', 'prices', 'cpi_data', 'exchange_rates'] as const;

/**
 * 查询行情相关 PostgreSQL 表的实际磁盘占用（含 TOAST 与索引）。
 *
 * @returns 字节数；查询失败时返回 0
 */
export async function getMarketDataStorageBytes(): Promise<number> {
  try {
    const pool = getReadPool();
    const { rows } = await pool.query<{ total_bytes: string }>(
      `SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(c.relname)::regclass)), 0)::text AS total_bytes
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND c.relname = ANY($1::text[])`,
      [MARKET_DATA_TABLES],
    );
    return parseInt(rows[0]?.total_bytes ?? '0', 10) || 0;
  } catch (err) {
    logger.warn({ err: err as Error }, '[marketStats] 查询 PostgreSQL 表空间失败');
    return 0;
  }
}

/**
 * 将字节数转为 MB（保留 1 位小数）。
 *
 * @param bytes 字节数
 * @returns 对应的 MB 数值（保留 1 位小数）
 */
export function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

// ---------------------------------------------------------------------------
// 纯辅助函数
// ---------------------------------------------------------------------------

/**
 * 根据 ticker 后缀或显式市场字段推断市场代码。
 *
 * @param ticker ticker 符号
 * @param market 显式市场字段
 * @returns 推断出的市场代码（CN / US 等）
 */
export function inferMarket(ticker: string, market: string): string {
  if (market) return market.toUpperCase();
  // 同时支持点号后缀（000001.SZ）与下划线后缀（000001_SZ），修复 A 股计数为 0 的 bug（Task 5.1）
  if (/[._](SZ|SS|SH)$/i.test(ticker)) return 'CN';
  return 'US';
}

/**
 * 按 ticker 后缀推导交易所代码（与 Go provider.DeriveExchange 保持一致）。
 *
 * @param ticker ticker 符号
 * @returns 交易所代码（SZSE / SSE / US）
 */
export function deriveExchangeFromTicker(ticker: string): string {
  if (/[._]SZ$/i.test(ticker)) return 'SZSE';
  if (/[._](SS|SH)$/i.test(ticker)) return 'SSE';
  return 'US';
}

/**
 * 根据 category 推断 ticker 类型。
 *
 * @param category 类别字段
 * @returns ETF / INDEX / STOCK
 */
export function inferType(category: string): string {
  const c = (category || '').toUpperCase();
  if (c.includes('ETF')) return 'ETF';
  if (c.includes('INDEX')) return 'INDEX';
  return 'STOCK';
}

/**
 * 将首日日期转换为年代标签（如 1990s）。
 *
 * @param firstDate YYYY-MM-DD 格式日期字符串
 * @returns 年代标签；解析失败返回 'unknown'
 */
export function decadeLabel(firstDate: string): string {
  const y = parseInt(firstDate.slice(0, 4), 10);
  if (Number.isNaN(y)) return 'unknown';
  return `${Math.floor(y / 10) * 10}s`;
}

/**
 * 根据首末日期计算 5 年跨度桶标签。
 *
 * @param firstDate 首个日期
 * @param lastDate 末个日期
 * @returns 桶标签（如 "5-9年"）
 */
function yearBucket(firstDate: string, lastDate: string): string {
  const startY = parseInt(firstDate.slice(0, 4), 10);
  const endY = parseInt((lastDate || firstDate).slice(0, 4), 10);
  const years = endY - startY;
  const lo = Math.floor(years / 5) * 5;
  return `${lo}-${lo + 4}年`;
}

/**
 * 判断样本 ticker 的分类键。
 *
 * @param market 市场代码
 * @param ttype ticker 类型
 * @returns 分类键（us_stock / us_etf / cn_stock / cn_etf / index），不匹配返回空串
 */
function categorizeSampleKey(market: string, ttype: string): string {
  if (market === 'US' && ttype === 'STOCK') return 'us_stock';
  if (market === 'US' && ttype === 'ETF') return 'us_etf';
  if (market === 'CN' && ttype === 'STOCK') return 'cn_stock';
  if (market === 'CN' && ttype === 'ETF') return 'cn_etf';
  if (ttype === 'INDEX') return 'index';
  return '';
}

/**
 * 累计年代与年限桶统计。
 *
 * @param firstDate 首个日期
 * @param lastDate 末个日期
 * @param byDecade 年代桶累加器
 * @param byYearCount 年限桶累加器
 * @returns 该 ticker 跨度年限
 */
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

/**
 * 更新市场/类型/交易所统计累加器。
 *
 * @param market 市场代码
 * @param ttype ticker 类型
 * @param exchange 交易所代码（SZSE / SSE / US 等）；由调用方从 DB 列或 ticker 推导得出
 * @param acc 按维度分组的累加器（byMarket / byType / byExchange）
 */
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

/**
 * 更新日期范围与年限覆盖率统计。
 *
 * @param firstDate 首个日期
 * @param lastDate 末个日期
 * @param byDecade 年代桶累加器
 * @param byYearCount 年限桶累加器
 * @param state 累加器状态
 */
function updateDateRangeStats(
  firstDate: string,
  lastDate: string,
  byDecade: Record<string, number>,
  byYearCount: Record<string, number>,
  state: TickerRowState,
): void {
  if (!firstDate) return;
  if (!state.earliest || firstDate < state.earliest) state.earliest = firstDate;
  if (!state.latest || lastDate > state.latest) state.latest = lastDate;
  const { years } = accumulateYearStats(firstDate, lastDate, byDecade, byYearCount);
  if (years >= 5) state.tickers5y++;
  if (years >= 10) state.tickers10y++;
  if (years >= 20) state.tickers20y++;
}

/**
 * 处理单行 ticker 聚合数据，更新统计累加器。
 *
 * @param opts 单行数据与全部累加器引用
 */
export function processTickerRow(opts: ProcessTickerRowOpts): void {
  const { row, byMarket, byType, byExchange, byDecade, byYearCount, sampleTickers, state } = opts;
  const market = inferMarket(row.ticker, row.market);
  const ttype = inferType(row.category);
  // 优先使用 DB 的 tickers.exchange 列；为空时由 ticker 后缀兜底推导（Task 4.3）
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

/**
 * 构建市场统计结果对象。
 *
 * @param args 累加后的统计数据与表空间占用字节数
 * @returns 完整的 DbMarketStats 快照
 */
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

// ---------------------------------------------------------------------------
// 主查询函数
// ---------------------------------------------------------------------------

/**
 * 从 PostgreSQL tickers + prices 表聚合数据引擎统计。
 *
 * @returns 统计快照；数据库不可用时返回 null
 */
export async function scanMarketStatsFromDb(): Promise<DbMarketStats | null> {
  try {
    const pool = getReadPool();
    const { rows } = await pool.query<TickerAggRow>(`
      SELECT
        t.ticker,
        COALESCE(t.market, '') AS market,
        COALESCE(t.category, '') AS category,
        COALESCE(t.exchange, '') AS exchange,
        COUNT(p.date)::int AS n_points,
        MIN(p.date)::text AS first_date,
        MAX(p.date)::text AS last_date
      FROM tickers t
      INNER JOIN prices p ON p.ticker = t.ticker
      GROUP BY t.ticker, t.market, t.category, t.exchange
      HAVING COUNT(p.date) > 0
    `);

    if (rows.length === 0) return null;

    const byMarket: DbMarketStats['by_market'] = {};
    const byType: Record<string, number> = {};
    const byExchange: Record<string, number> = {};
    const byDecade: Record<string, number> = {};
    const byYearCount: Record<string, number> = {};
    const sampleTickers: DbMarketStats['sample_tickers'] = {
      us_stock: [],
      us_etf: [],
      cn_stock: [],
      cn_etf: [],
      index: [],
    };
    const state = {
      earliest: null as string | null,
      latest: null as string | null,
      tickers5y: 0,
      tickers10y: 0,
      tickers20y: 0,
      totalDataPoints: 0,
      allPoints: [] as number[],
    };

    for (const row of rows) {
      processTickerRow({
        row,
        byMarket,
        byType,
        byExchange,
        byDecade,
        byYearCount,
        sampleTickers,
        state,
      });
    }

    const storageBytes = await getMarketDataStorageBytes();

    return buildMarketStatsResult({
      rows,
      byMarket,
      byType,
      byExchange,
      byDecade,
      byYearCount,
      sampleTickers,
      state,
      allPoints: state.allPoints,
      storageBytes,
    });
  } catch (err) {
    logger.warn({ err: err as Error }, '[marketStats] PostgreSQL 统计聚合失败');
    return null;
  }
}

/**
 * 引擎状态摘要（PostgreSQL）
 *
 * @returns tickers 总数 / 已缓存 tickers 数 / 最后更新时间；查询失败时各字段归零
 */
export async function getDbEngineStatus(): Promise<{
  totalTickers: number;
  cachedTickers: number;
  lastUpdate: string | null;
}> {
  try {
    const pool = getReadPool();
    const { rows } = await pool.query<{
      total: string;
      with_prices: string;
      last_update: Date | null;
    }>(`
      SELECT
        (SELECT COUNT(*)::text FROM tickers) AS total,
        (SELECT COUNT(DISTINCT ticker)::text FROM prices) AS with_prices,
        (SELECT MAX(updated_at) FROM tickers) AS last_update
    `);
    const row = rows[0];
    return {
      totalTickers: parseInt(row?.total ?? '0', 10),
      cachedTickers: parseInt(row?.with_prices ?? '0', 10),
      lastUpdate: row?.last_update ? new Date(row.last_update).toISOString() : null,
    };
  } catch {
    return { totalTickers: 0, cachedTickers: 0, lastUpdate: null };
  }
}
