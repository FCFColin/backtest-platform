/**
 * 平台前端服务路由（公告 / 特性开关 / 错误上报）— 原 announcementRoutes /
 * featureFlagRoutes / errorReportRoutes 三文件按"前端消费的平台端点"主题合并。
 *
 * 挂载于 /api/v1（app.ts 裸挂载，各端点内联自身中间件链），全局限流由 apiLimiter 覆盖。
 */

import { Router, type Request, type Response } from 'express';
import { pool, getReadPool } from '../db/pool.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { type AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { asyncRouteHandler } from './routeUtils.js';
import { validate } from '../middleware/miscMiddleware.js';
import { adminMiddleware } from '../middleware/middlewareChains.js';
import { createAnnouncementSchema, errorReportSchema } from '../schemas/tactical.js';
import { isEnabled, logFlagAccess, PLAN_LIMIT_FLAGS, type FlagContext } from '../config/index.js';
import {
  recordFrontendWebVital,
  recordFrontendApiCall,
  recordFrontendComponentRender,
  recordFrontendPageLoad,
} from '../utils/metrics.js';

const router = Router();

// ── 公告（P3-2）：管理员发布、所有用户查看 ────────────────────────────────────

// 内存缓存：公告极少变动（仅管理员发布），60s TTL 足够避免重复查库
let announcementCache: { data: object[]; expiry: number } | null = null;
const ANNOUNCEMENT_CACHE_TTL_MS = 60 * 1000;

router.get(
  '/announcements',
  asyncRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      if (announcementCache && Date.now() < announcementCache.expiry) {
        res.set('Cache-Control', 'public, max-age=60');
        res.json({ success: true, data: announcementCache.data });
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
      announcementCache = { data: result.rows, expiry: Date.now() + ANNOUNCEMENT_CACHE_TTL_MS };
      res.set('Cache-Control', 'public, max-age=60');
      res.json({ success: true, data: result.rows });
    },
    { logMsg: 'Announcements fetch error', code: 'ANNOUNCEMENTS_FETCH_ERROR' },
  ),
);

// 写端点仅管理员（E4：此前 POST 免认证可任意发布，与"管理员发布"声明不符；GET 保持公开）
router.post(
  '/announcements',
  ...adminMiddleware(),
  validate(createAnnouncementSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { title, body, category, severity } = req.body;
      if (!pool) {
        sendProblem(res, 503, 'DATABASE_UNAVAILABLE');
        return;
      }
      const result = await pool.query(
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
      );
      announcementCache = null;
      res.json({ success: true, data: result.rows[0] });
    },
    { logMsg: 'Announcement create error', code: 'ANNOUNCEMENT_CREATE_ERROR' },
  ),
);

// ── 特性开关（ADR-P1-06）：当前用户可见的 flag 状态 ───────────────────────────

// 仅暴露前端所需的开关，避免泄露内部运维 flag 名称
const VISIBLE_FLAGS = [
  PLAN_LIMIT_FLAGS.enterpriseQuota,
  PLAN_LIMIT_FLAGS.proAnalytics,
  'ui.new-dashboard',
] as const;

/** GET /api/v1/feature-flags — 返回当前用户可见的所有 flag 状态 */
router.get('/feature-flags', jwtAuth, (req: AuthenticatedRequest, res: Response) => {
  const context: FlagContext = {
    userId: req.user?.sub,
    orgId: req.user?.tenant_id,
  };

  const flags: Record<string, boolean> = {};
  for (const name of VISIBLE_FLAGS) {
    const enabled = isEnabled(name, context);
    flags[name] = enabled;
    logFlagAccess(name, context, enabled);
  }

  res.json({ success: true, data: { flags } });
});

// ── 前端错误/性能上报（P1-3）：无需认证，限流由全局 apiLimiter 覆盖 ──────────────

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
      // type === 'error': 传统错误上报
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
