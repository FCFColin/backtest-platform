import { Router, type Request, type Response } from 'express';
import { fetchCpiForRoute, SYNTHETIC_TICKERS } from '../infrastructure/dataServices.js';
import { sendProblem } from '../utils/errors.js';
import { crudRouteHandler, sendData, sendDegraded } from './routeUtils.js';
import { getReadPool } from '../db/pool.js';
import { rowMapper, toIso } from '../repositories/rowMapper.js';
import { createTtlCache } from '../utils/ttlCache.js';
import { callService } from '../utils/httpClient.js';
import { config } from '../config/index.js';

interface RecentUpdateRow {
  ticker: string;
  name: string;
  lastBarDate: string | null;
  updatedAt: string | null;
}
const mapRecentUpdate = rowMapper<RecentUpdateRow>({
  ticker: 'ticker',
  name: 'name',
  lastBarDate: 'last_bar_date',
  updatedAt: (r) => toIso(r.updated_at),
});

const tickerMetaCache = createTtlCache<unknown>(300_000);
const metaCache = createTtlCache<object>(30 * 60 * 1000);

const META_SQL = `SELECT
  (SELECT MAX(date) FROM prices) AS "lastUpdated",
  (SELECT MIN(date) FROM prices) AS "earliestDate",
  (SELECT COUNT(*) FROM tickers) AS "tickerCount",
  (SELECT reltuples::bigint FROM pg_class WHERE oid = 'prices'::regclass) AS "dataPointCount"`;

function buildMetaData(row: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    lastUpdated: row.lastUpdated ?? null,
    tickerCount: Number(row.tickerCount) || 0,
    earliestDate: row.earliestDate ?? null,
    dataPointCount: Number(row.dataPointCount) || 0,
  };
}

const EMPTY_META = { lastUpdated: null, tickerCount: 0, earliestDate: null, dataPointCount: 0 };

export async function warmMetaCache(): Promise<void> {
  try {
    const result = await getReadPool().query(META_SQL);
    metaCache.set('meta', buildMetaData(result.rows[0]));
  } catch {
    /* 预热失败不影响启动 */
  }
}

const router = Router();

router.get(
  '/health',
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const result = (await callService(
        config.GO_DATA_SERVICE_URL,
        '/api/data/health',
        undefined,
        5000,
      )) as { status?: string } | null;
      if (result?.status === 'ok') sendData(res, { status: 'ok' });
      else sendProblem(res, 503, 'DATA_SERVICE_UNAVAILABLE');
    },
    { logMsg: 'Go data service health check failed', code: 'DATA_SERVICE_UNAVAILABLE' },
  ),
);

router.get(
  '/cpi/:country',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const country = req.params.country;
      if (country !== 'us' && country !== 'cn') {
        sendProblem(res, 422, 'INVALID_COUNTRY');
        return;
      }
      const result = await fetchCpiForRoute(country);
      if (result.notFound) {
        sendProblem(res, 404, 'CPI_NOT_FOUND');
        return;
      }
      if (result.degraded) sendDegraded(res, result.data, result.degradedWarning);
      else sendData(res, result.data);
    },
    { logMsg: 'CPI data fetch error', code: 'CPI_FETCH_ERROR', endpoint: 'data-cpi' },
  ),
);

router.get(
  '/meta',
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const cached = metaCache.get('meta');
      if (cached) {
        sendData(res, cached);
        return;
      }
      try {
        const result = await getReadPool().query(META_SQL);
        const data = buildMetaData(result.rows[0]);
        metaCache.set('meta', data);
        sendData(res, data);
      } catch {
        sendData(res, EMPTY_META);
      }
    },
    { logMsg: 'Data meta fetch error', code: 'DATA_META_ERROR', endpoint: 'data-meta' },
  ),
);

router.get(
  '/factors',
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      try {
        const { rows } = await getReadPool().query(
          'SELECT date, mkt_rf, smb, hml, rf FROM fama_french_factors ORDER BY date',
        );
        res.set('Cache-Control', 'public, max-age=3600');
        sendData(res, rows);
      } catch {
        sendProblem(res, 503, 'DATA_UNAVAILABLE', 'Service Unavailable', {
          detail: 'Fama-French 因子数据暂不可用',
        });
      }
    },
    { logMsg: 'Fama-French factors fetch error', code: 'FACTORS_ERROR', endpoint: 'data-factors' },
  ),
);

router.get(
  '/ticker-meta',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ticker = String(req.query.ticker ?? '').toUpperCase();
      if (!ticker) {
        sendProblem(res, 400, 'BAD_REQUEST', 'Bad Request', { detail: 'ticker required' });
        return;
      }
      const synthetic = SYNTHETIC_TICKERS.find((s) => s.ticker === ticker);
      if (synthetic) {
        res.set('Cache-Control', 'public, max-age=60');
        sendData(res, {
          ticker,
          name: synthetic.name,
          exchange: 'SIM',
          currency: 'USD',
          earliestDate: synthetic.earliestDate,
          isSynthetic: true,
        });
        return;
      }
      const cached = tickerMetaCache.get(ticker);
      if (cached) {
        res.set('Cache-Control', 'public, max-age=60');
        sendData(res, cached);
        return;
      }
      try {
        const { rows } = await getReadPool().query(
          'SELECT t.ticker, t.category AS name, t.market, t.exchange, MIN(p.date) AS earliest FROM tickers t LEFT JOIN prices p ON p.ticker = t.ticker WHERE t.ticker = $1 GROUP BY t.ticker',
          [ticker],
        );
        if (rows.length === 0) {
          sendProblem(res, 404, 'TICKER_NOT_FOUND', 'Not Found', {
            detail: `ticker ${ticker} 未知`,
          });
          return;
        }
        const row = rows[0];
        const data = {
          ticker: row.ticker,
          name: row.name || row.ticker,
          exchange: row.exchange || (row.market === 'cn' ? 'SSE/SZSE' : 'NYSE'),
          currency: row.market === 'cn' ? 'CNY' : 'USD',
          earliestDate: row.earliest ?? null,
          isSynthetic: false,
        };
        tickerMetaCache.set(ticker, data);
        res.set('Cache-Control', 'public, max-age=60');
        sendData(res, data);
      } catch {
        sendProblem(res, 503, 'DATA_UNAVAILABLE', 'Service Unavailable', {
          detail: '元数据暂不可用，请稍后重试',
        });
      }
    },
    { logMsg: 'Ticker meta fetch error', code: 'TICKER_META_ERROR', endpoint: 'data-ticker-meta' },
  ),
);

router.get(
  '/recent-updates',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10), 50);
      const result = await getReadPool().query(
        `SELECT t.ticker,
                COALESCE(t.category, t.ticker) AS name,
                MAX(p.date)::text        AS last_bar_date,
                MAX(t.updated_at)        AS updated_at
         FROM tickers t
         LEFT JOIN prices p ON p.ticker = t.ticker
         GROUP BY t.ticker, t.category
         ORDER BY MAX(t.updated_at) DESC NULLS LAST
         LIMIT $1`,
        [limit],
      );
      sendData(res, result.rows.map(mapRecentUpdate));
    },
    {
      logMsg: 'Recent updates fetch error',
      code: 'RECENT_UPDATES_ERROR',
      endpoint: 'data-recent-updates',
    },
  ),
);

setInterval(() => void warmMetaCache(), 25 * 60 * 1000).unref();

export default router;
