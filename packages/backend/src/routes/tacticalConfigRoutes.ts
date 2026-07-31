/**
 * 战术配置 CRUD 路由（P1-1 持久化 / ADR-032 RLS 隔离）
 *
 * 挂载于 /api/v1/tactical/configs，前置链：crudMiddleware(STRATEGY_MANAGE)
 *   = jwtAuth → resolveTenant → requireTenant → requirePermission(STRATEGY_MANAGE)
 *
 * 所有数据操作经 tacticalConfigRepository（withTenant / withTenantReadOnly），
 * 在事务内激活 app.current_tenant_id 由 PostgreSQL RLS 强制租户隔离。
 * 创建时经 beforeCreate 执行配额检查（maxTacticalConfigs 按计划等级区分）。
 */
import { tenantCrudRoutes, requireTenantId, ownerOf } from './routeUtils.js';
import { sendProblem } from '../utils/errors.js';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import {
  createTacticalConfigSchema,
  updateTacticalConfigSchema,
} from '../schemas/tactical.js';
import * as tacticalConfigRepo from '../repositories/tacticalConfigRepository.js';
import { getOrg } from '../application/org/membershipService.js';
import { getPlanLimits } from '../application/billing/planLimitsService.js';
import { logger } from '../utils/logger.js';

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

/**
 * 创建前钩子：校验用户身份 + 计划配额（超出返回 402）。
 * 返回 false 表示已发送拒绝响应，终止创建。
 */
async function beforeCreate(req: AuthenticatedRequest, res: Response): Promise<boolean> {
  const tenantId = requireTenantId(req, res);
  if (!tenantId) return false;
  if (!ownerOf(req)) {
    sendProblem(res, 401, 'UNAUTHORIZED');
    return false;
  }
  const maxConfigs = await getMaxTacticalConfigs(tenantId);
  if (Number.isFinite(maxConfigs)) {
    const currentCount = await tacticalConfigRepo.count(tenantId);
    if (currentCount >= maxConfigs) {
      sendProblem(res, 402, 'TACTICAL_CONFIG_QUOTA_EXCEEDED', undefined, {
        detail: `战术配置数量已达上限 (${currentCount}/${maxConfigs})，请升级计划或删除旧配置`,
      });
      return false;
    }
  }
  return true;
}

export default tenantCrudRoutes(
  {
    list: tacticalConfigRepo.findByTenant,
    get: tacticalConfigRepo.findById,
    create: tacticalConfigRepo.create,
    update: tacticalConfigRepo.update,
    remove: tacticalConfigRepo.remove,
  },
  {
    resource: 'tactical-config',
    codePrefix: 'TACTICAL_CONFIG',
    notFoundCode: 'TACTICAL_CONFIG_NOT_FOUND',
    createSchema: createTacticalConfigSchema,
    updateSchema: updateTacticalConfigSchema,
    beforeCreate,
  },
);
