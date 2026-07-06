/**
 * 命名配置（saved_configs）CRUD 路由（ADR-034）
 *
 * 挂载于 /api/v1/configs，前置链：jwtAuth → resolveTenant → requireTenant
 * → requirePermission(BACKTEST_RUN)。所有操作经 savedConfigRepo（withTenant）隔离。
 */
import { Router, type Response } from 'express';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { hasTenant } from '../middleware/tenantContext.js';
import { savedConfigBodySchema, type SavedConfigBody } from '../schemas/persistence.js';
import {
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig,
} from '../services/savedConfigRepo.js';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ownerOf(req: AuthenticatedRequest): string | null {
  const sub = req.user?.sub;
  return sub && !sub.startsWith('apikey:') && !sub.startsWith('platform:') ? sub : null;
}

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  if (!hasTenant(req)) return;
  const tenantId = req.tenantId;
  try {
    res.json({ success: true, data: await listConfigs(tenantId) });
  } catch (err) {
    logger.error({ err: String(err), tenantId }, '[configRoutes] 列表失败');
    sendProblem(res, 500, 'CONFIG_LIST_FAILED', 'Internal Server Error', {
      detail: '查询配置失败',
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
    const c = await getConfig(tenantId, req.params.id);
    if (!c) {
      sendProblem(res, 404, 'CONFIG_NOT_FOUND', 'Not Found', { detail: '配置不存在' });
      return;
    }
    res.json({ success: true, data: c });
  } catch (err) {
    logger.error({ err: String(err), tenantId }, '[configRoutes] 获取失败');
    sendProblem(res, 500, 'CONFIG_GET_FAILED', 'Internal Server Error', { detail: '获取配置失败' });
  }
});

router.post(
  '/',
  validate(savedConfigBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!hasTenant(req)) return;
    const tenantId = req.tenantId;
    try {
      const created = await createConfig(tenantId, ownerOf(req), req.body as SavedConfigBody);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      logger.error({ err: String(err), tenantId }, '[configRoutes] 创建失败');
      sendProblem(res, 500, 'CONFIG_CREATE_FAILED', 'Internal Server Error', {
        detail: '创建配置失败',
      });
    }
  },
);

router.put(
  '/:id',
  validate(savedConfigBodySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!hasTenant(req)) return;
    const tenantId = req.tenantId;
    if (!UUID_RE.test(req.params.id)) {
      sendProblem(res, 400, 'INVALID_ID', 'Bad Request', { detail: 'ID 必须为 UUID' });
      return;
    }
    try {
      const updated = await updateConfig(tenantId, req.params.id, req.body as SavedConfigBody);
      if (!updated) {
        sendProblem(res, 404, 'CONFIG_NOT_FOUND', 'Not Found', { detail: '配置不存在' });
        return;
      }
      res.json({ success: true, data: updated });
    } catch (err) {
      logger.error({ err: String(err), tenantId }, '[configRoutes] 更新失败');
      sendProblem(res, 500, 'CONFIG_UPDATE_FAILED', 'Internal Server Error', {
        detail: '更新配置失败',
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
    const ok = await deleteConfig(tenantId, req.params.id);
    if (!ok) {
      sendProblem(res, 404, 'CONFIG_NOT_FOUND', 'Not Found', { detail: '配置不存在' });
      return;
    }
    res.json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (err) {
    logger.error({ err: String(err), tenantId }, '[configRoutes] 删除失败');
    sendProblem(res, 500, 'CONFIG_DELETE_FAILED', 'Internal Server Error', {
      detail: '删除配置失败',
    });
  }
});

export default router;
