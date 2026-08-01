/**
 * 用户回测工作台资源 CRUD（原 runRoutes / configRoutes / portfolioRoutes 并入）：
 * 运行历史（backtest_runs）、命名配置（saved_configs）、组合（portfolios）。
 *
 * 挂载于 /api/v1（子路径 /runs、/configs、/portfolios），前置链 crudMiddleware(BACKTEST_RUN)
 * = jwtAuth → resolveTenant → requireTenant → requirePermission(BACKTEST_RUN)。
 * 所有操作经对应仓储（withTenant）按 req.tenantId 隔离（ADR-034 / RLS）。
 */
import { Router } from 'express';
import { crudMiddleware } from '../middleware/middlewareChains.js';
import { Permission } from '../middleware/rbac.js';
import { tenantCrudRoutes } from './routeUtils.js';
import {
  backtestRunBodySchema,
  savedConfigBodySchema,
  portfolioBodySchema,
} from '../schemas/backtest.js';
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

// 运行记录是不可变的历史快照，无更新语义
router.use(
  '/runs',
  ...crudMiddleware(Permission.BACKTEST_RUN),
  tenantCrudRoutes(
    {
      list: listRuns,
      get: getRun,
      create: createRun,
      remove: deleteRun,
    },
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

export default router;
