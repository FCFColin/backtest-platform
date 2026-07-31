import { Router, type Request, type Response } from 'express';
import { fetchHistoryData, searchTickers } from '../infrastructure/dataFacade.js';
import { fetchCpiForRoute } from '../infrastructure/cpiLoader.js';
import { sendProblem } from '../utils/errors.js';
import { MAX_TICKERS } from '@backtest/shared/constants';
import { validateQuery } from '../middleware/miscMiddleware.js';
import { historyQuerySchema, searchQuerySchema } from '../schemas/data.js';
import { asyncRouteHandler } from './routeUtils.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { SYNTHETIC_TICKERS } from '../infrastructure/syntheticTickers.js';
import { getReadPool } from '../db/pool.js';

let metaCache: { data: object; expiry: number } | null = null;
const META_CACHE_TTL_MS = 30 * 60 * 1000;

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
    metaCache = { data: buildMetaData(result.rows[0]), expiry: Date.now() + META_CACHE_TTL_MS };
  } catch { /* 预热失败不影响启动 */ }
}

const router = Router();

router.get(
  '/history',
  validateQuery(historyQuerySchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { tickers, startDate, endDate } = req.query as { tickers: string; startDate: string; endDate: string };
      const tickerList = tickers.split(',').map((t) => t.trim()).filter(Boolean);
      if (tickerList.length > MAX_TICKERS) {
        sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED');
        return;
      }
      const { data, degraded, degradedWarning } = await fetchHistoryData(
        tickerList, startDate, endDate, (req as AuthenticatedRequest).tenantId,
      );
      const response: Record<string, unknown> = { success: true, data };
      if (degraded) {
        response.degraded = true;
        response.degradedWarning = degradedWarning || 'Data service degraded';
      }
      res.json(response);
    },
    { logMsg: 'History data fetch error', code: 'HISTORY_FETCH_ERROR', endpoint: 'data-history' },
  ),
);

router.get(
  '/search',
  validateQuery(searchQuerySchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { query, market } = req.query as { query: string; market?: string };
      const results = await searchTickers(query, market, (req as AuthenticatedRequest).tenantId);
      res.json({ success: true, data: results });
    },
    { logMsg: 'Ticker search error', code: 'SEARCH_ERROR', endpoint: 'data-search' },
  ),
);

router.get(
  '/cpi/:country',
  asyncRouteHandler(
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
      const response: Record<string, unknown> = { success: true, data: result.data };
      if (result.degraded) {
        response.degraded = true;
        response.degradedWarning = result.degradedWarning;
      }
      res.json(response);
    },
    { logMsg: 'CPI data fetch error', code: 'CPI_FETCH_ERROR', endpoint: 'data-cpi' },
  ),
);

router.get(
  '/synthetic',
  asyncRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      res.set('Cache-Control', 'public, max-age=300');
      res.json({ success: true, data: SYNTHETIC_TICKERS });
    },
    { logMsg: 'Synthetic tickers fetch error', code: 'SYNTHETIC_FETCH_ERROR', endpoint: 'data-synthetic' },
  ),
);

router.get(
  '/meta',
  asyncRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      if (metaCache && Date.now() < metaCache.expiry) {
        res.json({ success: true, data: metaCache.data });
        return;
      }
      try {
        const result = await getReadPool().query(META_SQL);
        const data = buildMetaData(result.rows[0]);
        metaCache = { data, expiry: Date.now() + META_CACHE_TTL_MS };
        res.json({ success: true, data });
      } catch {
        res.json({ success: true, data: EMPTY_META });
      }
    },
    { logMsg: 'Data meta fetch error', code: 'DATA_META_ERROR', endpoint: 'data-meta' },
  ),
);

router.get(
  '/ticker-meta',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ticker = String(req.query.ticker ?? '').toUpperCase();
      if (!ticker) {
        sendProblem(res, 400, 'BAD_REQUEST', 'Bad Request', { detail: 'ticker required' });
        return;
      }
      res.set('Cache-Control', 'public, max-age=60');
      res.json({
        success: true,
        data: { ticker, name: ticker, exchange: 'NYSE', currency: 'USD', earliestDate: '1962-01-02', isSynthetic: false },
      });
    },
    { logMsg: 'Ticker meta fetch error', code: 'TICKER_META_ERROR', endpoint: 'data-ticker-meta' },
  ),
);

router.get(
  '/recent-updates',
  asyncRouteHandler(
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
      res.json({
        success: true,
        data: result.rows.map((r: { ticker: string; name: string; last_bar_date: string | null; updated_at: Date | null }) => ({
          ticker: r.ticker,
          name: r.name,
          lastBarDate: r.last_bar_date,
          updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
        })),
      });
    },
    { logMsg: 'Recent updates fetch error', code: 'RECENT_UPDATES_ERROR', endpoint: 'data-recent-updates' },
  ),
);

// 定时预热 /data/meta 缓存（每 25 分钟），避免缓存过期后首次请求扫描大表
setInterval(() => { void warmMetaCache(); }, META_CACHE_TTL_MS - 5 * 60 * 1000);

export default router;
