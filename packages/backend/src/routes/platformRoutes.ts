import { Router, type Request, type Response } from 'express';
import { getReadPool, withPlatformContext } from '../db/pool.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { crudRouteHandler, sendData } from './routeUtils.js';
import { validate } from '../middleware/miscMiddleware.js';
import { platformAdminMiddleware } from '../middleware/middlewareChains.js';
import { createAnnouncementSchema, errorReportSchema } from '../schemas/tactical.js';
import {
  recordFrontendWebVital,
  recordFrontendApiCall,
  recordFrontendComponentRender,
  recordFrontendPageLoad,
} from '../utils/metrics.js';
import { createTtlCache } from '../utils/ttlCache.js';

const router = Router();

const announcementCache = createTtlCache<object[]>(60 * 1000);

router.get(
  '/announcements',
  crudRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const cached = announcementCache.get('announcements');
      if (cached) {
        res.set('Cache-Control', 'public, max-age=60');
        sendData(res, cached);
        return;
      }
      const readPool = getReadPool();
      if (!readPool) {
        sendProblem(res, 503, 'DATABASE_UNAVAILABLE');
        return;
      }
      const result = await readPool.query(
        `SELECT id, title, body, category, severity, published_at
         FROM announcements
         WHERE (expires_at IS NULL OR expires_at > NOW())
         ORDER BY published_at DESC
         LIMIT 50`,
      );
      announcementCache.set('announcements', result.rows);
      res.set('Cache-Control', 'public, max-age=60');
      sendData(res, result.rows);
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
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity, max-lines-per-function
router.post('/errors', validate(errorReportSchema), (req: Request, res: Response) => {
  const {
    type,
    message,
    stack,
    traceId,
    context,
    timestamp,
    url,
    userAgent,
    value,
    metric,
    endpoint,
    route,
    statusCode,
    component,
    phase,
  } = req.body;

  const logPayload: Record<string, unknown> = {
    type,
    traceId,
    timestamp,
    url: url?.slice(0, 500),
    userAgent: userAgent?.slice(0, 200),
  };

  switch (type) {
    case 'vital':
      logger.info(
        { ...logPayload, vital: { metric, value, route } },
        '[frontend-vital] Web Vital reported',
      );
      if (typeof metric === 'string' && typeof value === 'number') {
        recordFrontendWebVital(metric, value, typeof route === 'string' ? route : undefined);
      }
      break;

    case 'api_timing':
      logger.debug(
        { ...logPayload, apiTiming: { endpoint, duration: value, statusCode, route } },
        '[frontend-api-timing] API call timing reported',
      );
      if (typeof endpoint === 'string' && typeof value === 'number') {
        recordFrontendApiCall(
          endpoint,
          req.method || 'GET',
          typeof statusCode === 'number' ? statusCode : 0,
          value,
        );
      }
      break;

    case 'component_render':
      logger.debug(
        { ...logPayload, componentRender: { component, phase, duration: value } },
        '[frontend-component-render] Component render timing reported',
      );
      if (typeof component === 'string' && typeof phase === 'string' && typeof value === 'number') {
        recordFrontendComponentRender(component, phase, value);
      }
      break;

    case 'page_timing':
      logger.info(
        { ...logPayload, pageTiming: { metric, value, route } },
        '[frontend-page-timing] Page timing reported',
      );
      if (typeof metric === 'string' && typeof value === 'number') {
        recordFrontendPageLoad(metric, value);
      }
      break;

    case 'navigation':
      logger.debug(
        { ...logPayload, navigation: { route, duration: value } },
        '[frontend-navigation] Route navigation reported',
      );
      break;

    default:
      logger.warn(
        {
          ...logPayload,
          frontendError: {
            message,
            stack: stack?.slice(0, 2000),
            context,
          },
        },
        '[frontend-error] Client error reported',
      );
      break;
  }

  res.status(202).json({ success: true });
});

export default router;
