/**
 * 回测运行历史（backtest_runs）路由（ADR-034）
 *
 * 挂载于 /api/v1/runs，前置链：jwtAuth → resolveTenant → requireTenant
 * → requirePermission(BACKTEST_RUN)。所有操作经 backtestRunRepo（withTenant）隔离。
 *
 * 仅提供 list/get/create/delete：运行记录是不可变的历史快照，无更新语义。
 */
import { Router, type Response } from 'express';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { backtestRunBodySchema, type BacktestRunBody } from '../schemas/persistence.js';
import { listRuns, getRun, createRun, deleteRun } from '../services/backtestRunRepo.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ownerOf(req: AuthenticatedRequest): string | null {
  const sub = req.user?.sub;
  return sub && !sub.startsWith('apikey:') && !sub.startsWith('platform:') ? sub : null;
}

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tenantId as string;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  try {
    res.json({
      success: true,
      data: await listRuns(tenantId, Number.isFinite(limit) ? limit : 50),
    });
  } catch (err) {
    logger.error({ err: String(err), tenantId }, '[runRoutes] 列表失败');
    sendProblem(res, 500, 'RUN_LIST_FAILED', 'Internal Server Error', {
      detail: '查询回测历史失败',
    });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tenantId as string;
  if (!UUID_RE.test(req.params.id)) {
    sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'ID 必须为 UUID' });
    return;
  }
  try {
    const r = await getRun(tenantId, req.params.id);
    if (!r) {
      sendProblem(res, 404, 'RUN_NOT_FOUND', 'Not Found', { detail: '回测记录不存在' });
      return;
    }
    res.json({ success: true, data: r });
  } catch (err) {
    logger.error({ err: String(err), tenantId }, '[runRoutes] 获取失败');
    sendProblem(res, 500, 'RUN_GET_FAILED', 'Internal Server Error', {
      detail: '获取回测记录失败',
    });
  }
});

router.post(
  '/',
  validate(backtestRunBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const tenantId = req.tenantId as string;
    try {
      const created = await createRun(tenantId, ownerOf(req), req.body as BacktestRunBody);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      logger.error({ err: String(err), tenantId }, '[runRoutes] 创建失败');
      sendProblem(res, 500, 'RUN_CREATE_FAILED', 'Internal Server Error', {
        detail: '保存回测记录失败',
      });
    }
  },
);

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tenantId as string;
  if (!UUID_RE.test(req.params.id)) {
    sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'ID 必须为 UUID' });
    return;
  }
  try {
    const ok = await deleteRun(tenantId, req.params.id);
    if (!ok) {
      sendProblem(res, 404, 'RUN_NOT_FOUND', 'Not Found', { detail: '回测记录不存在' });
      return;
    }
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (err) {
    logger.error({ err: String(err), tenantId }, '[runRoutes] 删除失败');
    sendProblem(res, 500, 'RUN_DELETE_FAILED', 'Internal Server Error', {
      detail: '删除回测记录失败',
    });
  }
});

export default router;
