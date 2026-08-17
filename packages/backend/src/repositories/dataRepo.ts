import { getReadPool } from '../db/pool.js';
import { rowMapper, toIso } from './rowMapper.js';

const META_SQL = `SELECT (SELECT MAX(date) FROM prices) AS "lastUpdated", (SELECT MIN(date) FROM prices) AS "earliestDate", (SELECT COUNT(*) FROM tickers) AS "tickerCount", (SELECT reltuples::bigint FROM pg_class WHERE oid = 'prices'::regclass) AS "dataPointCount"`;

export async function queryMeta(): Promise<Record<string, unknown>> {
  const { rows } = await getReadPool().query(META_SQL);
  const r = rows[0] ?? {};
  return {
    lastUpdated: r.lastUpdated ?? null,
    tickerCount: Number(r.tickerCount) || 0,
    earliestDate: r.earliestDate ?? null,
    dataPointCount: Number(r.dataPointCount) || 0,
  };
}

export async function queryFamaFrenchFactors(): Promise<Record<string, unknown>[]> {
  return (
    await getReadPool().query(
      'SELECT date, mkt_rf, smb, hml, rf FROM fama_french_factors ORDER BY date',
    )
  ).rows;
}

export async function queryTickerMeta(ticker: string): Promise<Record<string, unknown> | null> {
  const { rows } = await getReadPool().query(
    'SELECT t.ticker, t.category AS name, t.market, t.exchange, MIN(p.date) AS earliest FROM tickers t LEFT JOIN prices p ON p.ticker = t.ticker WHERE t.ticker = $1 GROUP BY t.ticker',
    [ticker],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    ticker: r.ticker,
    name: r.name || r.ticker,
    exchange: r.exchange || (r.market === 'cn' ? 'SSE/SZSE' : 'NYSE'),
    currency: r.market === 'cn' ? 'CNY' : 'USD',
    earliestDate: r.earliest ?? null,
    isSynthetic: false,
  };
}

const mapRecentUpdate = rowMapper<{
  ticker: string;
  name: string;
  lastBarDate: string | null;
  updatedAt: string | null;
}>({
  ticker: 'ticker',
  name: 'name',
  lastBarDate: 'last_bar_date',
  updatedAt: (r) => toIso(r.updated_at),
});

export async function queryRecentUpdates(limit: number) {
  const { rows } = await getReadPool().query(
    'SELECT t.ticker, COALESCE(t.category, t.ticker) AS name, MAX(p.date)::text AS last_bar_date, MAX(t.updated_at) AS updated_at FROM tickers t LEFT JOIN prices p ON p.ticker = t.ticker GROUP BY t.ticker, t.category ORDER BY MAX(t.updated_at) DESC NULLS LAST LIMIT $1',
    [limit],
  );
  return rows.map(mapRecentUpdate);
}
