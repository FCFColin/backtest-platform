/**
 * @file Custom Tickers 路由
 * @description P2-6: 用户上传 CSV 定义自定义时间序列。
 *   per-user RLS 隔离，存储在 custom_tickers 表。
 */
import { Router, type Request, type Response } from 'express';
import { sendProblem } from '../utils/errors.js';
import { requirePermission, Permission } from '../middleware/rbac.js';
import { asyncRouteHandler } from './routeUtils.js';
import { pool } from '../db/pool.js';

const router = Router();
const requireDataManage = requirePermission(Permission.DATA_MANAGE);

/**
 * GET /api/v1/data/custom
 * 获取当前用户的所有自定义标的
 */
router.get(
  '/custom',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = req.user?.id;
      if (!userId) {
        sendProblem(res, 401, 'UNAUTHORIZED');
        return;
      }
      const result = await pool.query(
        'SELECT ticker, name, data, created_at FROM custom_tickers WHERE user_id = $1 ORDER BY ticker',
        [userId],
      );
      res.json({ success: true, data: result.rows });
    },
    { logMsg: 'Custom tickers fetch error', code: 'CUSTOM_FETCH_ERROR' },
  ),
);

/**
 * POST /api/v1/data/custom
 * 上传自定义标的（CSV 数据）
 */
router.post(
  '/custom',
  requireDataManage,
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = req.user?.id;
      if (!userId) {
        sendProblem(res, 401, 'UNAUTHORIZED');
        return;
      }
      const { ticker, name, data } = req.body;
      if (!ticker || !data) {
        sendProblem(res, 422, 'MISSING_PARAMS');
        return;
      }
      const result = await pool.query(
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
      const userId = req.user?.id;
      if (!userId) {
        sendProblem(res, 401, 'UNAUTHORIZED');
        return;
      }
      const { ticker } = req.params;
      await pool.query('DELETE FROM custom_tickers WHERE user_id = $1 AND ticker = $2', [
        userId,
        ticker,
      ]);
      res.json({ success: true, data: { deleted: true } });
    },
    { logMsg: 'Custom ticker delete error', code: 'CUSTOM_DELETE_ERROR' },
  ),
);

export default router;
