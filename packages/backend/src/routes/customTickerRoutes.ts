/**
 * @file Custom Tickers 路由
 * @description P2-6: 用户上传 CSV 定义自定义时间序列。
 *   per-user RLS 隔离，存储在 custom_tickers 表。
 */
import { Router, type Request, type Response } from 'express';
import type pg from 'pg';
import { sendProblem } from '../utils/errors.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { asyncRouteHandler } from './routeUtils.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { pool } from '../db/pool.js';
import { validate } from '../middleware/miscMiddleware.js';
import { customTickerCreateSchema } from '../schemas/data.js';

const router = Router();
const requireDataManage = requirePermission(Permission.DATA_MANAGE);

/** 共享守卫：认证用户 + DB 可用（customTickerRoutes 三端点同构守卫，抽取消除重复）。返回收窄后的 userId/pool。 */
function requireUserAndDb(req: Request, res: Response): { userId: string; pool: pg.Pool } | null {
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

/**
 * DELETE /api/v1/data/custom/:ticker
 * 删除自定义标的
 */
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

export default router;
