import { Router, type Request, type Response } from 'express';
import { fetchCpiForRoute, SYNTHETIC_TICKERS } from '../infrastructure/dataServices.js';
import { sendProblem } from '../utils/errors.js';
import { crudRouteHandler, sendData, sendDegraded } from './routeUtils.js';
import { createTtlCache, withTtlCache } from '../utils/ttlCache.js';
import { callService } from '../utils/httpClient.js';
import { config } from '../config/index.js';
import {
  queryMeta,
  queryFamaFrenchFactors,
  queryTickerMeta,
  queryRecentUpdates,
} from '../repositories/dataRepo.js';

const tickerMetaCache = createTtlCache<unknown>(300_000);
const metaCache = createTtlCache<object>(30 * 60 * 1000);

export async function warmMetaCache(): Promise<void> {
  try {
    metaCache.set('meta', await queryMeta());
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
      try {
        const data = await withTtlCache(metaCache, 'meta', queryMeta);
        sendData(res, data);
      } catch {
        sendDegraded(res, {}, '数据元信息暂不可用，返回空快照');
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
        const rows = await queryFamaFrenchFactors();
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
      const data = await withTtlCache(tickerMetaCache, ticker, () => queryTickerMeta(ticker)).catch(
        () => undefined,
      );
      if (data === undefined) {
        sendProblem(res, 503, 'DATA_UNAVAILABLE', 'Service Unavailable', {
          detail: '元数据暂不可用，请稍后重试',
        });
        return;
      }
      if (!data) {
        sendProblem(res, 404, 'TICKER_NOT_FOUND', 'Not Found', { detail: `ticker ${ticker} 未知` });
        return;
      }
      res.set('Cache-Control', 'public, max-age=60');
      sendData(res, data);
    },
    { logMsg: 'Ticker meta fetch error', code: 'TICKER_META_ERROR', endpoint: 'data-ticker-meta' },
  ),
);

router.get(
  '/recent-updates',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
      const rows = await queryRecentUpdates(limit);
      sendData(res, rows);
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
