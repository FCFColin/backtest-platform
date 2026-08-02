// 用户回测工作台资源 CRUD（运行历史/命名配置/组合），按 req.tenantId 隔离（ADR-034 / RLS）
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
