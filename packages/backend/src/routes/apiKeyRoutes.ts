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
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { sendProblem } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { createApiKey, listApiKeys, revokeApiKey } from '../repositories/apiKeyRepo.js';
import { crudRouteHandler, requireTenantId, requireUuidParam } from './routeUtils.js';

const router = Router();

/** 创建密钥请求体 */
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
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const createdBy = authReq.user?.sub?.startsWith('apikey:')
        ? null
        : (authReq.user?.sub ?? null);
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
    {
      logMsg: '[apiKeyRoutes] 创建 API Key 失败',
      code: 'API_KEY_CREATE_FAILED',
      title: 'Internal Server Error',
      detail: '创建 API Key 失败',
    },
  ),
);

/**
 * GET /api/v1/keys
 * 列出当前组织的全部 API Key（不含明文/哈希）。
 */
router.get(
  '/',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const keys = await listApiKeys(orgId);
      res.json({ success: true, data: keys });
    },
    {
      logMsg: '[apiKeyRoutes] 列出 API Key 失败',
      code: 'API_KEY_LIST_FAILED',
      title: 'Internal Server Error',
      detail: '查询 API Key 失败',
    },
  ),
);

/**
 * DELETE /api/v1/keys/:id
 * 吊销当前组织下的某把 API Key。
 */
router.delete(
  '/:id',
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      if (!requireUuidParam(res, req.params.id)) return;
      const orgId = requireTenantId(authReq, res);
      if (!orgId) return;
      const keyId = req.params.id;
      const ok = await revokeApiKey(orgId, keyId);
      if (!ok) {
        sendProblem(res, 404, 'API_KEY_NOT_FOUND', 'Not Found', {
          detail: '密钥不存在、不属于本组织或已吊销',
        });
        return;
      }
      res.json({ success: true, data: { id: keyId, revoked: true } });
    },
    {
      logMsg: '[apiKeyRoutes] 吊销 API Key 失败',
      code: 'API_KEY_REVOKE_FAILED',
      title: 'Internal Server Error',
      detail: '吊销 API Key 失败',
    },
  ),
);

export default router;
