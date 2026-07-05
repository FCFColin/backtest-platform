/**
 * 按组织（租户）的 API Key 管理路由（ADR-033）
 *
 * 挂载于 /api/v1/keys，鉴权链：jwtAuth → resolveTenant → requireTenant →
 * requirePermission(ADMIN_ACCESS)。即仅当前活跃组织的管理员可创建/查看/吊销密钥，
 * 且操作严格限定在 req.tenantId 所指组织内（防跨租户越权）。
 *
 * 端点：
 * - POST   /            创建密钥（明文一次性返回）
 * - GET    /            列出本组织密钥（含已吊销，审计用）
 * - DELETE /:id         吊销指定密钥
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { createApiKey, listApiKeys, revokeApiKey } from '../services/apiKeyService.js';

const router = Router();

/** 创建密钥请求体 */
const createKeySchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(120, '名称过长'),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/v1/keys
 * 为当前组织创建一把新的 API Key，明文仅此响应返回一次。
 */
router.post('/', validate(createKeySchema), async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.tenantId as string;
  const createdBy = req.user?.sub?.startsWith('apikey:') ? null : (req.user?.sub ?? null);
  try {
    const key = await createApiKey(orgId, (req.body as { name: string }).name, createdBy);
    res.status(201).json({
      success: true,
      data: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        createdAt: key.createdAt,
        // 明文密钥仅此刻返回，请妥善保存（服务端不再可见）
        apiKey: key.plaintext,
      },
    });
  } catch (err) {
    logger.error({ err: String(err), orgId }, '[apiKeyRoutes] 创建 API Key 失败');
    sendProblem(res, 500, 'API_KEY_CREATE_FAILED', 'Internal Server Error', {
      detail: '创建 API Key 失败',
    });
  }
});

/**
 * GET /api/v1/keys
 * 列出当前组织的全部 API Key（不含明文/哈希）。
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.tenantId as string;
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string, 10) || 100), 1000);
    const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);
    const { rows, total } = await listApiKeys(orgId, limit, offset);
    res.json({ success: true, data: rows, pagination: { total, limit, offset } });
  } catch (err) {
    logger.error({ err: String(err), orgId }, '[apiKeyRoutes] 列出 API Key 失败');
    sendProblem(res, 500, 'API_KEY_LIST_FAILED', 'Internal Server Error', {
      detail: '查询 API Key 失败',
    });
  }
});

/**
 * DELETE /api/v1/keys/:id
 * 吊销当前组织下的某把 API Key。
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const orgId = req.tenantId as string;
  const keyId = req.params.id;
  if (!UUID_RE.test(keyId)) {
    sendProblem(res, 400, 'INVALID_KEY_ID', 'Bad Request', { detail: 'API Key ID 必须为 UUID' });
    return;
  }
  try {
    const ok = await revokeApiKey(orgId, keyId);
    if (!ok) {
      sendProblem(res, 404, 'API_KEY_NOT_FOUND', 'Not Found', {
        detail: '密钥不存在、不属于本组织或已吊销',
      });
      return;
    }
    res.json({ success: true, data: { id: keyId, revoked: true } });
  } catch (err) {
    logger.error({ err: String(err), orgId, keyId }, '[apiKeyRoutes] 吊销 API Key 失败');
    sendProblem(res, 500, 'API_KEY_REVOKE_FAILED', 'Internal Server Error', {
      detail: '吊销 API Key 失败',
    });
  }
});

export default router;
