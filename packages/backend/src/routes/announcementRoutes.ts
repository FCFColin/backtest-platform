/**
 * @file Announcements 后端路由
 * @description P3-2: 公告系统，管理员发布、所有用户查看。
 */
import { Router, type Request, type Response } from 'express';
import { pool, getReadPool } from '../db/pool.js';
import { sendProblem } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { asyncRouteHandler } from './routeUtils.js';
import { validate } from '../middleware/miscMiddleware.js';
import { adminMiddleware } from '../middleware/middlewareChains.js';
import { createAnnouncementSchema } from '../schemas/misc-schemas.js';

const router = Router();

// 内存缓存：公告极少变动（仅管理员发布），60s TTL 足够避免重复查库
let announcementCache: { data: object[]; expiry: number } | null = null;
const ANNOUNCEMENT_CACHE_TTL_MS = 60 * 1000;

router.get(
  '/',
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
  '/',
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

export default router;
