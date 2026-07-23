/**
 * 回测运行历史（backtest_runs）路由（ADR-034）
 *
 * 挂载于 /api/v1/runs，前置链：jwtAuth → resolveTenant → requireTenant
 * → requirePermission(BACKTEST_RUN)。所有操作经 backtestRunRepo（withTenant）隔离。
 *
 * 仅提供 list/get/create/delete：运行记录是不可变的历史快照，无更新语义。
 */
import { Router, type Request, type Response } from 'express';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { backtestRunBodySchema, type BacktestRunBody } from '../schemas/persistence.js';
import { listRuns, getRun, createRun, deleteRun } from '../repositories/backtestRunRepo.js';
import { crudRouteHandler, ownerOf, requireTenantId, requireUuidParam } from './routeUtils.js';

const router = Router();

router.get(
  '/',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      const limit = req.query.limit ? Math.min(Number(req.query.limit) || 50, 200) : 50;
      const offset = req.query.offset ? Math.max(Number(req.query.offset) || 0, 0) : 0;
      res.json({
        success: true,
        data: await listRuns(tenantId, Math.max(1, limit), offset),
      });
    },
    {
      logMsg: '[runRoutes] 列表失败',
      code: 'RUN_LIST_FAILED',
    },
  ),
);

router.get(
  '/:id',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      if (!requireUuidParam(res, req.params.id)) return;
      const r = await getRun(tenantId, req.params.id);
      if (!r) {
        sendProblem(res, 404, 'RUN_NOT_FOUND');
        return;
      }
      res.json({ success: true, data: r });
    },
    {
      logMsg: '[runRoutes] 获取失败',
      code: 'RUN_GET_FAILED',
    },
  ),
);

router.post(
  '/',
  validate(backtestRunBodySchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      const created = await createRun(
        tenantId,
        ownerOf(req as AuthenticatedRequest),
        req.body as BacktestRunBody,
      );
      res.status(201).json({ success: true, data: created });
    },
    {
      logMsg: '[runRoutes] 创建失败',
      code: 'RUN_CREATE_FAILED',
    },
  ),
);

router.delete(
  '/:id',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      if (!requireUuidParam(res, req.params.id)) return;
      const ok = await deleteRun(tenantId, req.params.id);
      if (!ok) {
        sendProblem(res, 404, 'RUN_NOT_FOUND');
        return;
      }
      res.json({ success: true, data: { id: req.params.id, deleted: true } });
    },
    {
      logMsg: '[runRoutes] 删除失败',
      code: 'RUN_DELETE_FAILED',
    },
  ),
);

export default router;
