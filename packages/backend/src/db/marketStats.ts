/**
 * 从 PostgreSQL 聚合市场数据统计（替代 JSON 文件扫描）
 */
import { getReadPool } from './index.js';
import { logger } from '../utils/logger.js';

export interface DbMarketStats {
  generated_at: string;
  total_cached: number;
  by_market: Record<string, { count: number; stocks: number; etfs: number; indices: number }>;
  by_type: Record<string, number>;
  by_exchange: Record<string, number>;
  date_ranges: { earliest: string | null; latest: string | null };
  by_decade: Record<string, number>;
  by_year_count: Record<string, number>;
  coverage: {
    tickers_with_5y_plus: number;
    tickers_with_10y_plus: number;
    tickers_with_20y_plus: number;
    avg_data_points: number;
    median_data_points: number;
  };
  data_quality: {
    with_adj_close: number;
    with_dividends: number;
    with_splits: number;
    total_data_points: number;
    total_size_mb: number;
  };
  recent_updates: Array<{ ticker: string; name: string; updated: string }>;
  sample_tickers: Record<
    string,
    Array<{
      ticker: string;
      name: string;
      first_date: string;
      last_date: string;
      data_points: number;
    }>
  >;
}

interface TickerAggRow {
  ticker: string;
  market: string;
  category: string;
  n_points: number;
  first_date: string | null;
  last_date: string | null;
}

function inferMarket(ticker: string, market: string): string {
  if (market) return market.toUpperCase();
  if (/\.(SZ|SS|SH)$/i.test(ticker)) return 'CN';
  return 'US';
}

function inferType(category: string): string {
  const c = (category || '').toUpperCase();
  if (c.includes('ETF')) return 'ETF';
  if (c.includes('INDEX')) return 'INDEX';
  return 'STOCK';
}

function decadeLabel(firstDate: string): string {
  const y = parseInt(firstDate.slice(0, 4), 10);
  if (Number.isNaN(y)) return 'unknown';
  return `${Math.floor(y / 10) * 10}s`;
}

function yearBucket(firstDate: string, lastDate: string): string {
  const startY = parseInt(firstDate.slice(0, 4), 10);
  const endY = parseInt((lastDate || firstDate).slice(0, 4), 10);
  const years = endY - startY;
  const lo = Math.floor(years / 5) * 5;
  return `${lo}-${lo + 4}年`;
}

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

/** 将字节数转为 MB（保留 1 位小数） */
export function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

/**
 * 从 PostgreSQL tickers + prices 表聚合数据引擎统计。
 *
 * @returns 统计快照；数据库不可用时返回 null
 */
/** 判断样本 ticker 分类键 */
function categorizeSampleKey(market: string, ttype: string): string {
  if (market === 'US' && ttype === 'STOCK') return 'us_stock';
  if (market === 'US' && ttype === 'ETF') return 'us_etf';
  if (market === 'CN' && ttype === 'STOCK') return 'cn_stock';
  if (market === 'CN' && ttype === 'ETF') return 'cn_etf';
  if (ttype === 'INDEX') return 'index';
  return '';
}

/** 累计年限桶统计 */
function accumulateYearStats(
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

/** processTickerRow 的累加器状态 */
interface TickerRowState {
  earliest: string | null;
  latest: string | null;
  tickers5y: number;
  tickers10y: number;
  tickers20y: number;
  totalDataPoints: number;
  allPoints: number[];
}

/** processTickerRow 的全部参数 */
interface ProcessTickerRowOpts {
  row: TickerAggRow;
  byMarket: DbMarketStats['by_market'];
  byType: Record<string, number>;
  byExchange: Record<string, number>;
  byDecade: Record<string, number>;
  byYearCount: Record<string, number>;
  sampleTickers: DbMarketStats['sample_tickers'];
  state: TickerRowState;
}

/** 更新市场/类型/交易所统计 */
function updateMarketStats(
  market: string,
  ttype: string,
  byMarket: DbMarketStats['by_market'],
  byType: Record<string, number>,
  byExchange: Record<string, number>,
): void {
  if (!byMarket[market]) byMarket[market] = { count: 0, stocks: 0, etfs: 0, indices: 0 };
  byMarket[market].count++;
  if (ttype === 'STOCK') byMarket[market].stocks++;
  else if (ttype === 'ETF') byMarket[market].etfs++;
  else if (ttype === 'INDEX') byMarket[market].indices++;

  byType[ttype] = (byType[ttype] || 0) + 1;
  byExchange[''] = (byExchange[''] || 0) + 1;
}

/** 更新日期范围与年限覆盖率统计 */
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

/** 处理单行 ticker 聚合数据，更新统计累加器 */
function processTickerRow(opts: ProcessTickerRowOpts): void {
  const { row, byMarket, byType, byExchange, byDecade, byYearCount, sampleTickers, state } = opts;
  const market = inferMarket(row.ticker, row.market);
  const ttype = inferType(row.category);
  const nPoints = row.n_points;
  const firstDate = row.first_date || '';
  const lastDate = row.last_date || '';

  state.totalDataPoints += nPoints;
  state.allPoints.push(nPoints);

  updateMarketStats(market, ttype, byMarket, byType, byExchange);
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

/** 构建市场统计结果对象 */
function buildMarketStatsResult(args: {
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

export async function scanMarketStatsFromDb(): Promise<DbMarketStats | null> {
  try {
    const pool = getReadPool();
    const { rows } = await pool.query<TickerAggRow>(`
      SELECT
        t.ticker,
        COALESCE(t.market, '') AS market,
        COALESCE(t.category, '') AS category,
        COUNT(p.date)::int AS n_points,
        MIN(p.date)::text AS first_date,
        MAX(p.date)::text AS last_date
      FROM tickers t
      INNER JOIN prices p ON p.ticker = t.ticker
      GROUP BY t.ticker, t.market, t.category
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
