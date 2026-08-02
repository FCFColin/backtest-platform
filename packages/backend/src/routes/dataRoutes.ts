import { Router, type Request, type Response } from 'express';
import { fetchHistoryData, searchTickers } from '../infrastructure/dataFacade.js';
import { fetchCpiForRoute, SYNTHETIC_TICKERS } from '../infrastructure/dataServices.js';
import { sendProblem } from '../utils/errors.js';
import { MAX_TICKERS } from '@backtest/shared/constants';
import { validateQuery, validate } from '../middleware/miscMiddleware.js';
import {
  historyQuerySchema,
  searchQuerySchema,
  customTickerCreateSchema,
} from '../schemas/analysisSchemas.js';
import { asyncRouteHandler } from './routeUtils.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { getReadPool, pool } from '../db/pool.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { rowMapper, toIso } from '../repositories/rowMapper.js';

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

const tickerMetaCache = new Map<string, { data: unknown; at: number }>();
const TICKER_META_CACHE_TTL = 300_000;
function cachedTickerMeta(ticker: string): unknown | undefined {
  const hit = tickerMetaCache.get(ticker);
  return hit && Date.now() - hit.at < TICKER_META_CACHE_TTL ? hit.data : undefined;
}

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
  } catch {
    /* 预热失败不影响启动 */
  }
}

const router = Router();

router.get(
  '/history',
  validateQuery(historyQuerySchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { tickers, startDate, endDate } = req.query as {
        tickers: string;
        startDate: string;
        endDate: string;
      };
      const tickerList = tickers
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tickerList.length > MAX_TICKERS) {
        sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED');
        return;
      }
      const { data, degraded, degradedWarning } = await fetchHistoryData(
        tickerList,
        startDate,
        endDate,
        (req as AuthenticatedRequest).tenantId,
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
    {
      logMsg: 'Synthetic tickers fetch error',
      code: 'SYNTHETIC_FETCH_ERROR',
      endpoint: 'data-synthetic',
    },
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
  '/factors',
  asyncRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      try {
        const { rows } = await getReadPool().query(
          'SELECT date, mkt_rf, smb, hml, rf FROM fama_french_factors ORDER BY date',
        );
        res.set('Cache-Control', 'public, max-age=3600');
        res.json({ success: true, data: rows });
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
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ticker = String(req.query.ticker ?? '').toUpperCase();
      if (!ticker) {
        sendProblem(res, 400, 'BAD_REQUEST', 'Bad Request', { detail: 'ticker required' });
        return;
      }
      const synthetic = SYNTHETIC_TICKERS.find((s) => s.ticker === ticker);
      if (synthetic) {
        res.set('Cache-Control', 'public, max-age=60');
        res.json({
          success: true,
          data: {
            ticker,
            name: synthetic.name,
            exchange: 'SIM',
            currency: 'USD',
            earliestDate: synthetic.earliestDate,
            isSynthetic: true,
          },
        });
        return;
      }
      const cached = cachedTickerMeta(ticker);
      if (cached) {
        res.set('Cache-Control', 'public, max-age=60');
        res.json({ success: true, data: cached });
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
        tickerMetaCache.set(ticker, { data, at: Date.now() });
        res.set('Cache-Control', 'public, max-age=60');
        res.json({ success: true, data });
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
        data: result.rows.map(mapRecentUpdate),
      });
    },
    {
      logMsg: 'Recent updates fetch error',
      code: 'RECENT_UPDATES_ERROR',
      endpoint: 'data-recent-updates',
    },
  ),
);

const requireDataManage = requirePermission(Permission.DATA_MANAGE);

function requireUserAndDb(
  req: Request,
  res: Response,
): { userId: string; pool: NonNullable<typeof pool> } | null {
  const userId = (req as AuthenticatedRequest).user?.sub;
  if (!userId) {
    sendProblem(res, 401, 'UNAUTHORIZED');
    return null;
  }
  if (!pool) {
    sendProblem(res, 503, 'DATABASE_UNAVAILABLE');
    return null;
  }
  return { userId, pool };
}

router.get(
  '/custom',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = requireUserAndDb(req, res);
      if (!ctx) return;
      const { userId, pool: dbPool } = ctx;
      const result = await dbPool.query(
        'SELECT ticker, name, data, created_at FROM custom_tickers WHERE user_id = $1 ORDER BY ticker',
        [userId],
      );
      res.json({ success: true, data: result.rows });
    },
    { logMsg: 'Custom tickers fetch error', code: 'CUSTOM_FETCH_ERROR' },
  ),
);

router.post(
  '/custom',
  requireDataManage,
  validate(customTickerCreateSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = requireUserAndDb(req, res);
      if (!ctx) return;
      const { userId, pool: dbPool } = ctx;
      const { ticker, name, data } = req.body;
      const result = await dbPool.query(
        `INSERT INTO custom_tickers (user_id, ticker, name, data)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, ticker) DO UPDATE
         SET name = $3, data = $4, updated_at = NOW()
         RETURNING ticker, name, created_at`,
        [userId, ticker, name ?? '', JSON.stringify(data)],
      );
      res.json({ success: true, data: result.rows[0] });
    },
    { logMsg: 'Custom ticker upload error', code: 'CUSTOM_UPLOAD_ERROR' },
  ),
);

router.delete(
  '/custom/:ticker',
  requireDataManage,
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ctx = requireUserAndDb(req, res);
      if (!ctx) return;
      const { userId, pool: dbPool } = ctx;
      const { ticker } = req.params;
      await dbPool.query('DELETE FROM custom_tickers WHERE user_id = $1 AND ticker = $2', [
        userId,
        ticker,
      ]);
      res.json({ success: true, data: { deleted: true } });
    },
    { logMsg: 'Custom ticker delete error', code: 'CUSTOM_DELETE_ERROR' },
  ),
);

setInterval(() => void warmMetaCache(), META_CACHE_TTL_MS - 5 * 60 * 1000);

export default router;
