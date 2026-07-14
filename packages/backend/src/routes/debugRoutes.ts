/**
 * 调试与剖析端点（T-29）
 *
 * 企业为何需要：生产排障需 CPU/堆快照，但端点必须鉴权以防信息泄露。
 * 仅当 DEBUG_AUTH_TOKEN 配置时启用。
 */
import { Router, type Request, type Response } from 'express';
import { config } from '../config/index.js';
import { sendProblem } from '../utils/errors.js';

const router = Router();

function checkDebugAuth(req: Request, res: Response): boolean {
  const token = config.DEBUG_AUTH_TOKEN;
  if (!token) {
    sendProblem(res, 404, 'NOT_FOUND', 'Not Found', { detail: 'Debug endpoints disabled' });
    return false;
  }
  const auth = req.headers.authorization;
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (provided !== token) {
    sendProblem(res, 401, 'UNAUTHORIZED', 'Unauthorized', { detail: 'Invalid debug token' });
    return false;
  }
  return true;
}

/** GET /api/v1/debug/health — 调试子系统存活探测 */
router.get('/debug/health', (req, res) => {
  if (!checkDebugAuth(req, res)) return;
  res.json({
    success: true,
    data: {
      node: process.version,
      pid: process.pid,
      uptimeSec: process.uptime(),
      memory: process.memoryUsage(),
    },
  });
});

export default router;
