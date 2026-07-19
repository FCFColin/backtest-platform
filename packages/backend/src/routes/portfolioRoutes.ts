/**
 * 组合（portfolios）CRUD 路由（ADR-034）— 薄路由模式。
 *
 * 挂载于 /api/v1/portfolios，前置链：jwtAuth → resolveTenant → requireTenant
 * → requirePermission(BACKTEST_RUN)。路由只负责：请求解析 → 调用
 * portfolioRepo（withTenant）按 req.tenantId 隔离 → 响应格式化。
 */
import { Router, type Request, type Response } from 'express';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { portfolioBodySchema, type PortfolioBody } from '../schemas/persistence.js';
import { asyncRouteHandler, ownerOf, requireTenantId, requireUuidParam } from './routeUtils.js';
import {
  listPortfolios,
  getPortfolio,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
} from '../repositories/portfolioRepo.js';

const router = Router();

router.get(
  '/',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      const limit = req.query.limit ? Math.min(Number(req.query.limit) || 50, 200) : 50;
      const offset = req.query.offset ? Math.max(Number(req.query.offset) || 0, 0) : 0;
      res.json({
        success: true,
        data: await listPortfolios(tenantId, Math.max(1, limit), offset),
      });
    },
    {
      logMsg: '[portfolioRoutes] 列表失败',
      code: 'PORTFOLIO_LIST_FAILED',
      title: 'Internal Server Error',
      detail: '查询组合失败',
      endpoint: 'portfolio-list',
    },
  ),
);

router.get(
  '/:id',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      if (!requireUuidParam(res, req.params.id)) return;
      const p = await getPortfolio(tenantId, req.params.id);
      if (!p) {
        sendProblem(res, 404, 'PORTFOLIO_NOT_FOUND', 'Not Found', { detail: '组合不存在' });
        return;
      }
      res.json({ success: true, data: p });
    },
    {
      logMsg: '[portfolioRoutes] 获取失败',
      code: 'PORTFOLIO_GET_FAILED',
      title: 'Internal Server Error',
      detail: '获取组合失败',
      endpoint: 'portfolio-get',
    },
  ),
);

router.post(
  '/',
  validate(portfolioBodySchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      const created = await createPortfolio(
        tenantId,
        ownerOf(req as AuthenticatedRequest),
        req.body as PortfolioBody,
      );
      res.status(201).json({ success: true, data: created });
    },
    {
      logMsg: '[portfolioRoutes] 创建失败',
      code: 'PORTFOLIO_CREATE_FAILED',
      title: 'Internal Server Error',
      detail: '创建组合失败',
      endpoint: 'portfolio-create',
    },
  ),
);

router.put(
  '/:id',
  validate(portfolioBodySchema),
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      if (!requireUuidParam(res, req.params.id)) return;
      const updated = await updatePortfolio(tenantId, req.params.id, req.body as PortfolioBody);
      if (!updated) {
        sendProblem(res, 404, 'PORTFOLIO_NOT_FOUND', 'Not Found', { detail: '组合不存在' });
        return;
      }
      res.json({ success: true, data: updated });
    },
    {
      logMsg: '[portfolioRoutes] 更新失败',
      code: 'PORTFOLIO_UPDATE_FAILED',
      title: 'Internal Server Error',
      detail: '更新组合失败',
      endpoint: 'portfolio-update',
    },
  ),
);

router.delete(
  '/:id',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const tenantId = requireTenantId(req as AuthenticatedRequest, res);
      if (!tenantId) return;
      if (!requireUuidParam(res, req.params.id)) return;
      const ok = await deletePortfolio(tenantId, req.params.id);
      if (!ok) {
        sendProblem(res, 404, 'PORTFOLIO_NOT_FOUND', 'Not Found', { detail: '组合不存在' });
        return;
      }
      res.json({ success: true, data: { id: req.params.id, deleted: true } });
    },
    {
      logMsg: '[portfolioRoutes] 删除失败',
      code: 'PORTFOLIO_DELETE_FAILED',
      title: 'Internal Server Error',
      detail: '删除组合失败',
      endpoint: 'portfolio-delete',
    },
  ),
);

export default router;
