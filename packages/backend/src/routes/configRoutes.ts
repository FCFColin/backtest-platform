/**
 * 命名配置（saved_configs）CRUD 路由（ADR-034）
 *
 * 挂载于 /api/v1/configs，前置链：jwtAuth → resolveTenant → requireTenant
 * → requirePermission(BACKTEST_RUN)。所有操作经 savedConfigRepo（withTenant）隔离。
 */
import { Router, type Request, type Response } from 'express';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { savedConfigBodySchema, type SavedConfigBody } from '../schemas/persistence.js';
import {
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig,
} from '../repositories/savedConfigRepo.js';
import { crudRouteHandler, ownerOf, requireTenantId, requireUuidParam } from './routeUtils.js';

const router = Router();

router.get(
  '/',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
      const offset = req.query.offset ? Math.max(Number(req.query.offset), 0) : 0;
      res.json({ success: true, data: await listConfigs(tenantId, Math.max(1, limit), offset) });
    },
    {
      logMsg: '[configRoutes] 列表失败',
      code: 'CONFIG_LIST_FAILED',
      title: 'Internal Server Error',
      detail: '查询配置失败',
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
      const c = await getConfig(tenantId, req.params.id);
      if (!c) {
        sendProblem(res, 404, 'CONFIG_NOT_FOUND', 'Not Found', { detail: '配置不存在' });
        return;
      }
      res.json({ success: true, data: c });
    },
    {
      logMsg: '[configRoutes] 获取失败',
      code: 'CONFIG_GET_FAILED',
      title: 'Internal Server Error',
      detail: '获取配置失败',
    },
  ),
);

router.post(
  '/',
  validate(savedConfigBodySchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      const created = await createConfig(
        tenantId,
        ownerOf(req as AuthenticatedRequest),
        req.body as SavedConfigBody,
      );
      res.status(201).json({ success: true, data: created });
    },
    {
      logMsg: '[configRoutes] 创建失败',
      code: 'CONFIG_CREATE_FAILED',
      title: 'Internal Server Error',
      detail: '创建配置失败',
    },
  ),
);

router.put(
  '/:id',
  validate(savedConfigBodySchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      if (!requireUuidParam(res, req.params.id)) return;
      const updated = await updateConfig(tenantId, req.params.id, req.body as SavedConfigBody);
      if (!updated) {
        sendProblem(res, 404, 'CONFIG_NOT_FOUND', 'Not Found', { detail: '配置不存在' });
        return;
      }
      res.json({ success: true, data: updated });
    },
    {
      logMsg: '[configRoutes] 更新失败',
      code: 'CONFIG_UPDATE_FAILED',
      title: 'Internal Server Error',
      detail: '更新配置失败',
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
      const ok = await deleteConfig(tenantId, req.params.id);
      if (!ok) {
        sendProblem(res, 404, 'CONFIG_NOT_FOUND', 'Not Found', { detail: '配置不存在' });
        return;
      }
      res.json({ success: true, data: { id: req.params.id, deleted: true } });
    },
    {
      logMsg: '[configRoutes] 删除失败',
      code: 'CONFIG_DELETE_FAILED',
      title: 'Internal Server Error',
      detail: '删除配置失败',
    },
  ),
);

export default router;
