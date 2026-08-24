import { Router, type Request, type Response } from 'express';
import { getReadPool, withPlatformContext } from '../db/pool.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { crudRouteHandler, sendData } from './routeUtils.js';
import { validate } from '../middleware/miscMiddleware.js';
import { platformAdminMiddleware } from '../middleware/middlewareChains.js';
import { createAnnouncementSchema, errorReportSchema } from '../schemas/platform.js';
import {
  recordFrontendWebVital,
  recordFrontendApiCall,
  recordFrontendComponentRender,
  recordFrontendPageLoad,
} from '../utils/metrics.js';
import { createTtlCache, withTtlCache } from '../utils/ttlCache.js';

const router = Router();

const announcementCache = createTtlCache<object[]>(60 * 1000);

router.get(
  '/announcements',
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const readPool = getReadPool();
      if (!readPool) {
        sendProblem(res, 503, 'DATABASE_UNAVAILABLE');
        return;
      }
      const sendRows = (rows: object[]): void => {
        res.set('Cache-Control', 'public, max-age=60');
        sendData(res, rows);
      };
      const rows =
        (await withTtlCache(announcementCache, 'announcements', async () => {
          const { rows } = await readPool.query(
            `SELECT id, title, body, category, severity, published_at FROM announcements WHERE (expires_at IS NULL OR expires_at > NOW()) ORDER BY published_at DESC LIMIT 50`,
          );
          return rows;
        })) ?? [];
      sendRows(rows);
    },
    { logMsg: 'Announcements fetch error', code: 'ANNOUNCEMENTS_FETCH_ERROR' },
  ),
);

router.post(
  '/announcements',
  ...platformAdminMiddleware(),
  validate(createAnnouncementSchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { title, body, category, severity } = req.body;
      const result = await withPlatformContext((client) =>
        client.query(
          `INSERT INTO announcements (title, body, category, severity, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, title, published_at`,
          [
            title,
            body,
            category ?? 'general',
            severity ?? 'info',
            (req as AuthenticatedRequest).user?.sub,
          ],
        ),
      );
      announcementCache.clear();
      sendData(res, result.rows[0]);
    },
    { logMsg: 'Announcement create error', code: 'ANNOUNCEMENT_CREATE_ERROR' },
  ),
);

// 前端错误/性能上报：无需认证
function handleFrontendReport(req: Request, res: Response): void {
  const b = req.body;
  const p: Record<string, unknown> = {
    type: b.type,
    traceId: b.traceId,
    timestamp: b.timestamp,
    url: b.url?.slice(0, 500),
    userAgent: b.userAgent?.slice(0, 200),
  };
  const str = (v: unknown) => typeof v === 'string';
  const num = () => typeof b.value === 'number';

  (
    ({
      vital: () => {
        logger.info(
          { ...p, vital: { metric: b.metric, value: b.value, route: b.route } },
          '[frontend-vital] Web Vital reported',
        );
        if (str(b.metric) && num()) recordFrontendWebVital(b.metric, b.value);
      },
      api_timing: () => {
        logger.debug(
          {
            ...p,
            apiTiming: {
              endpoint: b.endpoint,
              duration: b.value,
              statusCode: b.statusCode,
              route: b.route,
            },
          },
          '[frontend-api-timing] API call timing reported',
        );
        if (str(b.endpoint) && num())
          recordFrontendApiCall(
            b.endpoint,
            req.method || 'GET',
            typeof b.statusCode === 'number' ? b.statusCode : 0,
            b.value,
          );
      },
      component_render: () => {
        logger.debug(
          { ...p, componentRender: { component: b.component, phase: b.phase, duration: b.value } },
          '[frontend-component-render] Component render timing reported',
        );
        if (str(b.component) && str(b.phase) && num())
          recordFrontendComponentRender(b.component, b.phase, b.value);
      },
      page_timing: () => {
        logger.info(
          { ...p, pageTiming: { metric: b.metric, value: b.value, route: b.route } },
          '[frontend-page-timing] Page timing reported',
        );
        if (str(b.metric) && num()) recordFrontendPageLoad(b.metric, b.value);
      },
      navigation: () => {
        logger.debug(
          { ...p, navigation: { route: b.route, duration: b.value } },
          '[frontend-navigation] Route navigation reported',
        );
      },
    })[b.type as string] ??
    (() =>
      void logger.warn(
        {
          ...p,
          frontendError: { message: b.message, stack: b.stack?.slice(0, 2000), context: b.context },
        },
        '[frontend-error] Client error reported',
      ))
  )();
  res.status(202).json({ success: true });
}

router.post('/errors', validate(errorReportSchema), handleFrontendReport);

export default router;
