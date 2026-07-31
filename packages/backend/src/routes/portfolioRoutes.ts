/**
 * 组合（portfolios）CRUD 路由（ADR-034）— 薄路由模式。
 *
 * 挂载于 /api/v1/portfolios，前置链：jwtAuth → resolveTenant → requireTenant
 * → requirePermission(BACKTEST_RUN)。路由只负责：请求解析 → 调用
 * portfolioRepo（withTenant）按 req.tenantId 隔离 → 响应格式化。
 */
import { tenantCrudRoutes } from './routeUtils.js';
import { portfolioBodySchema } from '../schemas/persistence.js';
import {
  listPortfolios,
  getPortfolio,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
} from '../repositories/portfolioRepo.js';

export default tenantCrudRoutes(
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
);
