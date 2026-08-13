// 用户回测工作台资源 CRUD（运行历史/命名配置/组合/战术配置），按 req.tenantId 隔离（ADR-009 / RLS）
import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { crudMiddleware } from '../middleware/middlewareChains.js';
import { Permission } from '../middleware/rbac.js';
import { tenantCrudRoutes, requireTenantId, ownerOf } from './routeUtils.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  backtestRunBodySchema,
  savedConfigBodySchema,
  portfolioBodySchema,
} from '../schemas/backtest.js';
import { createTacticalConfigSchema, updateTacticalConfigSchema } from '../schemas/tactical.js';
import * as tacticalConfigRepo from '../repositories/tacticalConfigRepository.js';
import { getOrg } from '../application/org/membershipService.js';
import { getPlanLimits } from '../application/billing/planLimitsService.js';
import { listRuns, getRun, createRun, deleteRun } from '../repositories/backtestRunRepo.js';
import {
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig,
} from '../repositories/savedConfigRepo.js';
import {
  listPortfolios,
  getPortfolio,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
} from '../repositories/portfolioRepo.js';

const router = Router();

router.use(
  '/runs',
  ...crudMiddleware(Permission.BACKTEST_RUN),
  tenantCrudRoutes(
    { list: listRuns, get: getRun, create: createRun, remove: deleteRun },
    {
      resource: 'runs',
      codePrefix: 'RUN',
      notFoundCode: 'RUN_NOT_FOUND',
      createSchema: backtestRunBodySchema,
    },
  ),
);

router.use(
  '/configs',
  ...crudMiddleware(Permission.BACKTEST_RUN),
  tenantCrudRoutes(
    {
      list: listConfigs,
      get: getConfig,
      create: createConfig,
      update: updateConfig,
      remove: deleteConfig,
    },
    {
      resource: 'configs',
      codePrefix: 'CONFIG',
      notFoundCode: 'CONFIG_NOT_FOUND',
      createSchema: savedConfigBodySchema,
      updateSchema: savedConfigBodySchema,
    },
  ),
);

router.use(
  '/portfolios',
  ...crudMiddleware(Permission.BACKTEST_RUN),
  tenantCrudRoutes(
    {
      list: listPortfolios,
      get: getPortfolio,
      create: createPortfolio,
      update: updatePortfolio,
      remove: deletePortfolio,
    },
    {
      resource: 'portfolios',
      codePrefix: 'PORTFOLIO',
      notFoundCode: 'PORTFOLIO_NOT_FOUND',
      createSchema: portfolioBodySchema,
      updateSchema: portfolioBodySchema,
      metricPrefix: 'portfolio',
    },
  ),
);

async function getMaxTacticalConfigs(tenantId: string): Promise<number> {
  try {
    const org = await getOrg(tenantId);
    return getPlanLimits(org?.plan ?? null).maxTacticalConfigs;
  } catch {
    logger.warn({ tenantId }, '[tactical-config] 组织查询失败，降级为 free 配额');
    return getPlanLimits('free').maxTacticalConfigs;
  }
}

async function beforeCreateTacticalConfig(
  req: AuthenticatedRequest,
  res: Response,
): Promise<boolean> {
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

router.use(
  '/tactical/configs',
  ...crudMiddleware(Permission.STRATEGY_MANAGE),
  tenantCrudRoutes(
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
      beforeCreate: beforeCreateTacticalConfig,
    },
  ),
);

export default router;
