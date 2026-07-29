/**
 * 数据路由 — 纯 HTTP 适配层。
 *
 * 路由只负责：请求解析 → 调用 service → 响应格式化。
 * 行情/搜索走 services/dataService.ts，CPI 走 services/cpiService.ts；
 * 数据获取、熔断、降级与内存缓存均在 service 层管理，路由不持有状态。
 *
 * GET /api/data/history   - 获取历史行情数据
 * GET /api/data/search    - 搜索资产代码
 * GET /api/data/cpi/:country - 获取 CPI 数据
 * GET /api/data/synthetic  - 获取合成标的列表
 */

import { Router, type Request, type Response } from 'express';
import { fetchHistoryData, searchTickers } from '../infrastructure/dataFacade.js';
import { fetchCpiForRoute } from '../infrastructure/cpiLoader.js';
import { sendProblem } from '../utils/errors.js';
import { MAX_TICKERS } from '@backtest/shared/constants';
import { validateQuery } from '../middleware/validate.js';
import { historyQuerySchema, searchQuerySchema } from '../schemas/data.js';
import { asyncRouteHandler } from './routeUtils.js';
import { SYNTHETIC_TICKERS } from '../infrastructure/syntheticTickers.js';
import { getPool } from '../db/pool.js';

// 内存缓存：/data/meta 聚合查询结果，5 分钟 TTL
let metaCache: { data: object; expiry: number } | null = null;
const META_CACHE_TTL_MS = 5 * 60 * 1000;

/** 预热 /data/meta 缓存，服务器启动时调用 */
export async function warmMetaCache(): Promise<void> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT
         (SELECT MAX(date) FROM prices) AS "lastUpdated",
         (SELECT MIN(date) FROM prices) AS "earliestDate",
         (SELECT COUNT(*) FROM tickers) AS "tickerCount",
         (SELECT approximate_row_count('public.prices'::regclass)) AS "dataPointCount"`,
    );
    const row = result.rows[0] ?? {};
    metaCache = {
      data: {
        lastUpdated: row.lastUpdated ?? null,
        tickerCount: Number(row.tickerCount) || 0,
        earliestDate: row.earliestDate ?? null,
        dataPointCount: Number(row.dataPointCount) || 0,
      },
      expiry: Date.now() + META_CACHE_TTL_MS,
    };
  } catch { /* 预热失败不影响启动 */ }
}

const router = Router();

/**
 * 获取历史行情数据
 * GET /api/data/history?tickers=SPY,VTI&startDate=2020-01-01&endDate=2024-12-31
 */
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
        req.tenantId,
      );

      const response: Record<string, unknown> = { success: true, data };
      if (degraded) {
        response.degraded = true;
        response.degradedWarning = degradedWarning || 'Data service degraded';
      }
      res.json(response);
    },
    {
      logMsg: 'History data fetch error',
      code: 'HISTORY_FETCH_ERROR',
      endpoint: 'data-history',
    },
  ),
);

/**
 * 搜索资产代码
 * GET /api/data/search?query=茅台&market=A股
 */
router.get(
  '/search',
  validateQuery(searchQuerySchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { query, market } = req.query as { query: string; market?: string };

      const results = await searchTickers(query, market, req.tenantId);

      res.json({ success: true, data: results });
    },
    {
      logMsg: 'Ticker search error',
      code: 'SEARCH_ERROR',
      endpoint: 'data-search',
    },
  ),
);

/**
 * 获取 CPI 数据
 * GET /api/data/cpi/:country
 *
 * 薄路由：仅做参数校验与响应格式化，三级降级（Go → 缓存 → PG → 404）与内存缓存
 * 下沉至 services/cpiService.ts 的 fetchCpiForRoute。
 */
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
    {
      logMsg: 'CPI data fetch error',
      code: 'CPI_FETCH_ERROR',
      endpoint: 'data-cpi',
    },
  ),
);

/**
 * 获取合成标的列表
 * GET /api/data/synthetic
 *
 * 返回所有可用的 SIM (Synthetic) 标的元数据。
 * 合成标的通过多段数据拼接实现长历史回测。
 */
router.get(
  '/synthetic',
  asyncRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      res.json({ success: true, data: SYNTHETIC_TICKERS });
    },
    {
      logMsg: 'Synthetic tickers fetch error',
      code: 'SYNTHETIC_FETCH_ERROR',
      endpoint: 'data-synthetic',
    },
  ),
);

/**
 * GET /api/v1/data/meta — 数据元信息（最后更新/标的数/最早日期/数据点数）。
 */
router.get(
  '/meta',
  asyncRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      if (metaCache && Date.now() < metaCache.expiry) {
        res.json({ success: true, data: metaCache.data });
        return;
      }
      const pool = getPool();
      try {
        const result = await pool.query(
          `SELECT
             (SELECT MAX(date) FROM prices) AS "lastUpdated",
             (SELECT MIN(date) FROM prices) AS "earliestDate",
             (SELECT COUNT(*) FROM tickers) AS "tickerCount",
(SELECT approximate_row_count('public.prices'::regclass)) AS "dataPointCount"`,
        );
        const row = result.rows[0] ?? {};
        const data = {
          lastUpdated: row.lastUpdated ?? null,
          tickerCount: Number(row.tickerCount) || 0,
          earliestDate: row.earliestDate ?? null,
          dataPointCount: Number(row.dataPointCount) || 0,
        };
        metaCache = { data, expiry: Date.now() + META_CACHE_TTL_MS };
        res.json({ success: true, data });
      } catch {
        res.json({
          success: true,
          data: {
            lastUpdated: null,
            tickerCount: 0,
            earliestDate: null,
            dataPointCount: 0,
          },
        });
      }
    },
    {
      logMsg: 'Data meta fetch error',
      code: 'DATA_META_ERROR',
      endpoint: 'data-meta',
    },
  ),
);

/**
 * GET /api/v1/data/ticker-meta?ticker=VTI — 单个 ticker 元数据。
 */
router.get(
  '/ticker-meta',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const ticker = String(req.query.ticker ?? '').toUpperCase();
      if (!ticker) {
        res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'ticker required' } });
        return;
      }
      res.json({
        success: true,
        data: {
          ticker,
          name: ticker,
          exchange: 'NYSE',
          currency: 'USD',
          earliestDate: '1962-01-02',
          isSynthetic: false,
        },
      });
    },
    {
      logMsg: 'Ticker meta fetch error',
      code: 'TICKER_META_ERROR',
      endpoint: 'data-ticker-meta',
    },
  ),
);

/**
 * GET /api/v1/data/recent-updates — 最近更新的 ticker 列表。
 *
 * 按 tickers.updated_at 倒序返回最近被更新的标的及其最新行情日期。
 * 列名对齐实际 schema：prices.date（非 bar_date）、tickers.category（无 name 列）、
 * tickers.updated_at（prices 无 updated_at 列）。
 */
router.get(
  '/recent-updates',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10), 50);
      const pool = (await import('@/db/index.js')).default;
      const result = await pool.query(
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
    {
      logMsg: 'Recent updates fetch error',
      code: 'RECENT_UPDATES_ERROR',
      endpoint: 'data-recent-updates',
    },
  ),
);

export default router;
