import type {
  DbMarketStats,
  TickerAggRow,
  ProcessTickerRowOpts,
  MarketStatsAccumulators,
} from './marketStatsTypes.js';

export function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

export function inferMarket(ticker: string, market: string): string {
  if (market) return market.toUpperCase();
  if (/[._](SZ|SS|SH)$/i.test(ticker)) return 'CN';
  return 'US';
}

export function deriveExchangeFromTicker(ticker: string): string {
  if (/[._]SZ$/i.test(ticker)) return 'SZSE';
  if (/[._](SS|SH)$/i.test(ticker)) return 'SSE';
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
  const lo = Math.floor((endY - startY) / 5) * 5;
  return `${lo}-${lo + 4}年`;
}

const SAMPLE_KEY_MAP: Array<[string, string, string]> = [
  ['US', 'STOCK', 'us_stock'],
  ['US', 'ETF', 'us_etf'],
  ['CN', 'STOCK', 'cn_stock'],
  ['CN', 'ETF', 'cn_etf'],
];
function categorizeSampleKey(market: string, ttype: string): string {
  for (const [m, t, key] of SAMPLE_KEY_MAP) if (market === m && ttype === t) return key;
  return ttype === 'INDEX' ? 'index' : '';
}

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

function updateMarketStats(
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
  byExchange[exchange] = (byExchange[exchange] || 0) + 1;
}

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

export function processTickerRow(opts: ProcessTickerRowOpts): void {
  const { row, byMarket, byType, byExchange, byDecade, byYearCount, sampleTickers, state } = opts;
  const market = inferMarket(row.ticker, row.market);
  const ttype = inferType(row.category);
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
