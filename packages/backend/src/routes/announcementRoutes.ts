/**
 * @file Announcements 后端路由
 * @description P3-2: 公告系统，管理员发布、所有用户查看。
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db/pool.js';
import { asyncRouteHandler } from './routeUtils.js';
import { validate } from '../middleware/validate.js';
import { createAnnouncementSchema } from '../schemas/announcement.js';

const router = Router();

/**
 * GET /api/v1/announcements
 * 获取公告列表（公开，无需认证）
 */
router.get(
  '/',
  asyncRouteHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const result = await pool.query(
        `SELECT id, title, body, category, severity, published_at
         FROM announcements
         WHERE (expires_at IS NULL OR expires_at > NOW())
         ORDER BY published_at DESC
         LIMIT 50`,
      );
      res.json({ success: true, data: result.rows });
    },
    { logMsg: 'Announcements fetch error', code: 'ANNOUNCEMENTS_FETCH_ERROR' },
  ),
);

/**
 * POST /api/v1/announcements
 * 发布公告（仅管理员）
 */
router.post(
  '/',
  validate(createAnnouncementSchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { title, body, category, severity } = req.body;
      const result = await pool.query(
        `INSERT INTO announcements (title, body, category, severity, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, title, published_at`,
        [title, body, category ?? 'general', severity ?? 'info', req.user?.id],
      );
      res.json({ success: true, data: result.rows[0] });
    },
    { logMsg: 'Announcement create error', code: 'ANNOUNCEMENT_CREATE_ERROR' },
  ),
);

export default router;
