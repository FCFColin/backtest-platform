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
import { hasTenant } from '../middleware/tenantContext.js';
import { portfolioBodySchema, type PortfolioBody } from '../schemas/persistence.js';
import { asyncRouteHandler } from './routeUtils.js';
import {
  listPortfolios,
  getPortfolio,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
} from '../repositories/portfolioRepo.js';
import { isUuid } from '../utils/validation.js';

const router = Router();

/** 解析创建者用户 ID（API Key 调用方记为 null） */
function ownerOf(req: AuthenticatedRequest): string | null {
  const sub = req.user?.sub;
  return sub && !sub.startsWith('apikey:') && !sub.startsWith('platform:') ? sub : null;
}

router.get(
  '/',
  asyncRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      if (!hasTenant(authReq)) return;
      const tenantId = authReq.tenantId;
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
      const authReq = req as AuthenticatedRequest;
      if (!hasTenant(authReq)) return;
      const tenantId = authReq.tenantId;
      if (!isUuid(req.params.id)) {
        sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'ID 必须为 UUID' });
        return;
      }
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
      const authReq = req as AuthenticatedRequest;
      if (!hasTenant(authReq)) return;
      const tenantId = authReq.tenantId;
      const created = await createPortfolio(tenantId, ownerOf(authReq), req.body as PortfolioBody);
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
      const authReq = req as AuthenticatedRequest;
      if (!hasTenant(authReq)) return;
      const tenantId = authReq.tenantId;
      if (!isUuid(req.params.id)) {
        sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'ID 必须为 UUID' });
        return;
      }
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
      const authReq = req as AuthenticatedRequest;
      if (!hasTenant(authReq)) return;
      const tenantId = authReq.tenantId;
      if (!isUuid(req.params.id)) {
        sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'ID 必须为 UUID' });
        return;
      }
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
