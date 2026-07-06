/**
 * 组合（portfolios）CRUD 路由（ADR-034）
 *
 * 挂载于 /api/v1/portfolios，前置链：jwtAuth → resolveTenant → requireTenant
 * → requirePermission(BACKTEST_RUN)。所有操作经 portfolioRepo（withTenant）按
 * req.tenantId 隔离。
 */
import { Router, type Response } from 'express';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { hasTenant } from '../middleware/tenantContext.js';
import { portfolioBodySchema, type PortfolioBody } from '../schemas/persistence.js';
import {
  listPortfolios,
  getPortfolio,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
} from '../services/portfolioRepo.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 解析创建者用户 ID（API Key 调用方记为 null） */
function ownerOf(req: AuthenticatedRequest): string | null {
  const sub = req.user?.sub;
  return sub && !sub.startsWith('apikey:') && !sub.startsWith('platform:') ? sub : null;
}

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!hasTenant(req)) return;
  const tenantId = req.tenantId;
  try {
    res.json({ success: true, data: await listPortfolios(tenantId) });
  } catch (err) {
    logger.error({ err: String(err), tenantId }, '[portfolioRoutes] 列表失败');
    sendProblem(res, 500, 'PORTFOLIO_LIST_FAILED', 'Internal Server Error', {
      detail: '查询组合失败',
    });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  if (!hasTenant(req)) return;
  const tenantId = req.tenantId;
  if (!UUID_RE.test(req.params.id)) {
    sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'ID 必须为 UUID' });
    return;
  }
  try {
    const p = await getPortfolio(tenantId, req.params.id);
    if (!p) {
      sendProblem(res, 404, 'PORTFOLIO_NOT_FOUND', 'Not Found', { detail: '组合不存在' });
      return;
    }
    res.json({ success: true, data: p });
  } catch (err) {
    logger.error({ err: String(err), tenantId }, '[portfolioRoutes] 获取失败');
    sendProblem(res, 500, 'PORTFOLIO_GET_FAILED', 'Internal Server Error', {
      detail: '获取组合失败',
    });
  }
});

router.post(
  '/',
  validate(portfolioBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!hasTenant(req)) return;
    const tenantId = req.tenantId;
    try {
      const created = await createPortfolio(tenantId, ownerOf(req), req.body as PortfolioBody);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      logger.error({ err: String(err), tenantId }, '[portfolioRoutes] 创建失败');
      sendProblem(res, 500, 'PORTFOLIO_CREATE_FAILED', 'Internal Server Error', {
        detail: '创建组合失败',
      });
    }
  },
);

router.put(
  '/:id',
  validate(portfolioBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!hasTenant(req)) return;
    const tenantId = req.tenantId;
    if (!UUID_RE.test(req.params.id)) {
      sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'ID 必须为 UUID' });
      return;
    }
    try {
      const updated = await updatePortfolio(tenantId, req.params.id, req.body as PortfolioBody);
      if (!updated) {
        sendProblem(res, 404, 'PORTFOLIO_NOT_FOUND', 'Not Found', { detail: '组合不存在' });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) {
      logger.error({ err: String(err), tenantId }, '[portfolioRoutes] 更新失败');
      sendProblem(res, 500, 'PORTFOLIO_UPDATE_FAILED', 'Internal Server Error', {
        detail: '更新组合失败',
      });
    }
  },
);

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  if (!hasTenant(req)) return;
  const tenantId = req.tenantId;
  if (!UUID_RE.test(req.params.id)) {
    sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'ID 必须为 UUID' });
    return;
  }
  try {
    const ok = await deletePortfolio(tenantId, req.params.id);
    if (!ok) {
      sendProblem(res, 404, 'PORTFOLIO_NOT_FOUND', 'Not Found', { detail: '组合不存在' });
      return;
    }
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (err) {
    logger.error({ err: String(err), tenantId }, '[portfolioRoutes] 删除失败');
    sendProblem(res, 500, 'PORTFOLIO_DELETE_FAILED', 'Internal Server Error', {
      detail: '删除组合失败',
    });
  }
});

export default router;
