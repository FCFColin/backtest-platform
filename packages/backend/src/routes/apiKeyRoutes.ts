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
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { createApiKey, listApiKeys, revokeApiKey } from '../repositories/apiKeyRepo.js';
import { tenantHandler, requireUuidParam } from './routeUtils.js';

const router = Router();

const createKeySchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(120, '名称过长'),
});

/**
 * POST /api/v1/keys
 * 为当前组织创建一把新的 API Key，明文仅此响应返回一次。
 */
router.post(
  '/',
  validate(createKeySchema),
  tenantHandler(
    '[apiKeyRoutes] 创建 API Key 失败',
    'API_KEY_CREATE_FAILED',
    async (req, res, orgId) => {
      const createdBy = req.user?.sub?.startsWith('apikey:') ? null : (req.user?.sub ?? null);
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
    },
  ),
);

/**
 * GET /api/v1/keys
 * 列出当前组织的全部 API Key（不含明文/哈希）。
 */
router.get(
  '/',
  tenantHandler(
    '[apiKeyRoutes] 列出 API Key 失败',
    'API_KEY_LIST_FAILED',
    async (_req, res, orgId) => {
      res.json({ success: true, data: await listApiKeys(orgId) });
    },
  ),
);

/**
 * DELETE /api/v1/keys/:id
 * 吊销当前组织下的某把 API Key。
 */
router.delete(
  '/:id',
  tenantHandler(
    '[apiKeyRoutes] 吊销 API Key 失败',
    'API_KEY_REVOKE_FAILED',
    async (req, res, orgId) => {
      if (!requireUuidParam(res, req.params.id)) return;
      const keyId = req.params.id;
      const ok = await revokeApiKey(orgId, keyId);
      if (!ok) {
        sendProblem(res, 404, 'API_KEY_NOT_FOUND');
        return;
      }
      res.json({ success: true, data: { id: keyId, revoked: true } });
    },
  ),
);

export default router;
