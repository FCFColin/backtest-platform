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
 */

import { Router, type Request, type Response } from 'express';
import { fetchHistoryData, searchTickers } from '../infrastructure/dataFacade.js';
import { fetchCpiForRoute } from '../infrastructure/cpiLoader.js';
import { sendProblem } from '../utils/errors.js';
import { MAX_TICKERS } from '@backtest/shared/constants';
import { validateQuery } from '../middleware/validate.js';
import { historyQuerySchema, searchQuerySchema } from '../schemas/data.js';
import { asyncRouteHandler } from './routeUtils.js';

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
        sendProblem(res, 422, 'TICKER_LIMIT_EXCEEDED', 'Ticker limit exceeded', {
          detail: `ticker 数量超过限制 (max ${MAX_TICKERS})`,
        });
        return;
      }

      const { data, degraded, degradedWarning } = await fetchHistoryData(
        tickerList,
        startDate,
        endDate,
      );

      const response: Record<string, unknown> = { success: true, data };
      if (degraded) {
        response.degraded = true;
        response.degradedWarning = degradedWarning || '数据服务降级';
      }
      res.json(response);
    },
    {
      logMsg: 'History data fetch error',
      code: 'HISTORY_FETCH_ERROR',
      title: 'History Fetch Error',
      detail: 'Failed to fetch history data',
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

      const results = await searchTickers(query, market);

      res.json({ success: true, data: results });
    },
    {
      logMsg: 'Ticker search error',
      code: 'SEARCH_ERROR',
      title: 'Search failed',
      detail: 'Failed to search tickers',
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
        sendProblem(res, 422, 'INVALID_COUNTRY', 'Invalid country parameter', {
          detail: '仅支持 us 或 cn 的CPI数据',
        });
        return;
      }

      const result = await fetchCpiForRoute(country);

      if (result.notFound) {
        sendProblem(res, 404, 'CPI_NOT_FOUND', 'CPI data not found', {
          detail: 'PostgreSQL 中无 CPI 数据，请先运行 import:tickers',
        });
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
      title: 'CPI fetch failed',
      detail: 'Failed to fetch CPI data',
      endpoint: 'data-cpi',
    },
  ),
);

export default router;
