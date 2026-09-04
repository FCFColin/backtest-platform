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

// Prometheus 标签基数防爆炸：endpoint/component 仅放行白名单（与前端实际上报路径对齐），
// 未知值归一为 other，防止任意字符串（含用户可控 URL）无上界撑爆直方图标签基数
const ENDPOINT_ALLOWLIST = new Set([
  '/api/v1/admin/stats',
  '/api/v1/admin/system',
  '/api/v1/analysis/factor-regression',
  '/api/v1/announcements',
  '/api/v1/auth/login/password',
  '/api/v1/auth/logout',
  '/api/v1/auth/me',
  '/api/v1/auth/orgs',
  '/api/v1/auth/refresh',
  '/api/v1/auth/register',
  '/api/v1/auth/switch-org',
  '/api/v1/auth/verify-email',
  '/api/v1/backtest/analysis',
  '/api/v1/backtest/efficient-frontier',
  '/api/v1/backtest/monte-carlo',
  '/api/v1/backtest/optimize',
  '/api/v1/backtest/portfolio',
  '/api/v1/backtest/portfolio/series',
  '/api/v1/backtest-optimizer/optimize',
  '/api/v1/billing/checkout',
  '/api/v1/billing/portal',
  '/api/v1/billing/subscription',
  '/api/v1/configs',
  '/api/v1/data/factors',
  '/api/v1/data/health',
  '/api/v1/data/manage/stats',
  '/api/v1/data/manage/universe',
  '/api/v1/data/manage/update/full',
  '/api/v1/data/manage/update/inc',
  '/api/v1/data/meta',
  '/api/v1/data/recent-updates',
  '/api/v1/data/ticker-meta',
  '/api/v1/goal-optimizer/optimize',
  '/api/v1/letf/analyze',
  '/api/v1/orgs/invitations',
  '/api/v1/orgs/invitations/accept',
  '/api/v1/orgs/members',
  '/api/v1/pca/analyze',
  '/api/v1/signal/analyze',
  '/api/v1/signal/dual',
  '/api/v1/signal/multi',
  '/api/v1/tactical/backtest',
  '/api/v1/tactical/configs',
  '/api/v1/tactical/what-if',
  '/api/v1/tactical-grid/search',
]);
const COMPONENT_ALLOWLIST = new Set([
  'DataEngine',
  'ErrorBoundary',
  'RouteErrorBoundary',
  'DataManagement',
  'SystemSettings',
  'backtestStore',
  'portfolioStorage',
]);
const allowlisted = (v: string, allow: Set<string>): string => (allow.has(v) ? v : 'other');

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
            allowlisted((b.endpoint as string).split('?')[0].slice(0, 128), ENDPOINT_ALLOWLIST),
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
          recordFrontendComponentRender(
            allowlisted(b.component as string, COMPONENT_ALLOWLIST),
            b.phase as string,
            b.value,
          );
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
