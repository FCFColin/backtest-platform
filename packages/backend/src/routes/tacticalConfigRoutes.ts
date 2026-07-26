/**
 * 战术配置 CRUD 路由（P1-1 持久化 / ADR-032 RLS 隔离）
 *
 * 挂载于 /api/v1/tactical/configs，前置链：crudMiddleware(STRATEGY_MANAGE)
 *   = jwtAuth → resolveTenant → requireTenant → requirePermission(STRATEGY_MANAGE)
 *
 * 所有数据操作经 tacticalConfigRepository（withTenant / withTenantReadOnly），
 * 在事务内激活 app.current_tenant_id 由 PostgreSQL RLS 强制租户隔离。
 *
 * 创建时执行配额检查（maxTacticalConfigs 按计划等级区分）。
 */
import { Router, type Request, type Response } from 'express';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import {
  createTacticalConfigSchema,
  updateTacticalConfigSchema,
  type CreateTacticalConfigBody,
  type UpdateTacticalConfigBody,
} from '../schemas/tactical.js';
import * as tacticalConfigRepo from '../repositories/tacticalConfigRepository.js';
import { getOrg } from '../application/org/membershipService.js';
import { getPlanLimits } from '../application/billing/planLimitsService.js';
import { crudRouteHandler, ownerOf, requireTenantId, requireUuidParam } from './routeUtils.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * 查询当前租户的计划配额上限（maxTacticalConfigs）。
 * 组织查询失败时降级为 free 计划限制（保守策略）。
 */
async function getMaxTacticalConfigs(tenantId: string): Promise<number> {
  try {
    const org = await getOrg(tenantId);
    return getPlanLimits(org?.plan ?? null).maxTacticalConfigs;
  } catch {
    logger.warn({ tenantId }, '[tactical-config] 组织查询失败，降级为 free 配额');
    return getPlanLimits('free').maxTacticalConfigs;
  }
}

// GET / — 列表（分页）
router.get(
  '/',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
      const offset = req.query.offset ? Math.max(Number(req.query.offset), 0) : 0;
      const data = await tacticalConfigRepo.findByTenant(tenantId, Math.max(1, limit), offset);
      res.json({ success: true, data });
    },
    {
      logMsg: '[tactical-config] 列表失败',
      code: 'TACTICAL_CONFIG_LIST_FAILED',
    },
  ),
);

// GET /:id — 详情
router.get(
  '/:id',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      if (!requireUuidParam(res, req.params.id)) return;
      const config = await tacticalConfigRepo.findById(tenantId, req.params.id);
      if (!config) {
        sendProblem(res, 404, 'TACTICAL_CONFIG_NOT_FOUND');
        return;
      }
      res.json({ success: true, data: config });
    },
    {
      logMsg: '[tactical-config] 获取失败',
      code: 'TACTICAL_CONFIG_GET_FAILED',
    },
  ),
);

// POST / — 创建（含配额检查）
router.post(
  '/',
  validate(createTacticalConfigSchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      const userId = ownerOf(req as AuthenticatedRequest);
      if (!userId) {
        sendProblem(res, 401, 'UNAUTHORIZED');
        return;
      }

      // 配额检查：每租户战术配置上限
      const maxConfigs = await getMaxTacticalConfigs(tenantId);
      if (Number.isFinite(maxConfigs)) {
        const currentCount = await tacticalConfigRepo.count(tenantId);
        if (currentCount >= maxConfigs) {
          sendProblem(res, 402, 'TACTICAL_CONFIG_QUOTA_EXCEEDED', undefined, {
            detail: `战术配置数量已达上限 (${currentCount}/${maxConfigs})，请升级计划或删除旧配置`,
          });
          return;
        }
      }

      const created = await tacticalConfigRepo.create(
        tenantId,
        userId,
        req.body as CreateTacticalConfigBody,
      );
      res.status(201).json({ success: true, data: created });
    },
    {
      logMsg: '[tactical-config] 创建失败',
      code: 'TACTICAL_CONFIG_CREATE_FAILED',
    },
  ),
);

// PUT /:id — 更新
router.put(
  '/:id',
  validate(updateTacticalConfigSchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      if (!requireUuidParam(res, req.params.id)) return;
      const updated = await tacticalConfigRepo.update(
        tenantId,
        req.params.id,
        req.body as UpdateTacticalConfigBody,
      );
      if (!updated) {
        sendProblem(res, 404, 'TACTICAL_CONFIG_NOT_FOUND');
        return;
      }
      res.json({ success: true, data: updated });
    },
    {
      logMsg: '[tactical-config] 更新失败',
      code: 'TACTICAL_CONFIG_UPDATE_FAILED',
    },
  ),
);

// DELETE /:id — 删除
router.delete(
  '/:id',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      if (!requireUuidParam(res, req.params.id)) return;
      const ok = await tacticalConfigRepo.remove(tenantId, req.params.id);
      if (!ok) {
        sendProblem(res, 404, 'TACTICAL_CONFIG_NOT_FOUND');
        return;
      }
      res.json({ success: true, data: { id: req.params.id, deleted: true } });
    },
    {
      logMsg: '[tactical-config] 删除失败',
      code: 'TACTICAL_CONFIG_DELETE_FAILED',
    },
  ),
);

export default router;
