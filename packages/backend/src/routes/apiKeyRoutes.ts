/**
 * API Key 管理路由 — 组织密钥（ADR-033）+ 平台 break-glass 密钥（P0-04）。
 *
 * 原 apiKeyRoutes.ts（/api/v1/keys）与 adminKeyRoutes.ts（/api/v1/admin/keys）按
 * "API Key 生命周期管理"主题合并，两者共用 repositories/apiKeyRepo.ts。
 *
 * 端点：
 * - POST   /keys                    创建组织密钥（明文一次性返回）
 * - GET    /keys                    列出本组织密钥（含已吊销，审计用）
 * - DELETE /keys/:id                吊销指定组织密钥
 * - POST   /admin/keys/rotate       轮换平台 break-glass 密钥（明文一次性返回）
 * - DELETE /admin/keys/:id          吊销指定平台密钥（Redis 吊销缓存即时生效）
 * - GET    /admin/keys              列出全部平台密钥（含已吊销，审计用）
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { recordAuthFailure, getRoutePattern } from '../utils/metrics.js';
import { jwtAuth, auditLog, type AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { crudMiddleware } from '../middleware/middlewareChains.js';
import { Permission } from '../middleware/rbac.js';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotatePlatformAdminKey,
  revokePlatformAdminKey,
  listPlatformAdminKeys,
  PLATFORM_ADMIN_KEY_MAX_TTL_DAYS,
} from '../repositories/apiKeyRepo.js';
import { markApiKeyRevoked } from '../infrastructure/apiKeyVerifier.js';
import { tenantHandler, requireUuidParam, crudRouteHandler, jsonRoute } from './routeUtils.js';

const router = Router();

// ── 组织（租户）API Key（ADR-033）────────────────────────────────────────────

const createKeySchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(120, '名称过长'),
});

/**
 * POST /api/v1/keys
 * 为当前组织创建一把新的 API Key，明文仅此响应返回一次。
 */
router.post(
  '/keys',
  ...crudMiddleware(Permission.ADMIN_ACCESS),
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
  '/keys',
  ...crudMiddleware(Permission.ADMIN_ACCESS),
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
  '/keys/:id',
  ...crudMiddleware(Permission.ADMIN_ACCESS),
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

// ── 平台 break-glass 密钥（P0-04）─────────────────────────────────────────────

/**
 * 平台管理员守卫：仅 platform_admin=TRUE 的请求可管理 break-glass 密钥。
 * 租户内 admin（即便有 ADMIN_ACCESS）也不应能轮换/吊销它——否则被攻陷的租户管理员可禁用运维应急通道。
 */
function requirePlatformAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.user?.platform_admin !== true) {
    recordAuthFailure(getRoutePattern(req), 'not_platform_admin');
    sendProblem(res, 403, 'INSUFFICIENT_PERMISSION');
    return;
  }
  next();
}

/** 轮换请求体（均可选，提供默认值） */
const rotateSchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(120, '名称过长').optional(),
  expiresInDays: z.number().int().min(1).max(PLATFORM_ADMIN_KEY_MAX_TTL_DAYS).optional(),
});

/**
 * POST /api/v1/admin/keys/rotate
 * 轮换当前用于鉴权的平台 break-glass 密钥。旧密钥立即吊销，新明文一次性返回。
 */
router.post(
  '/admin/keys/rotate',
  jwtAuth,
  auditLog,
  requirePlatformAdmin,
  validate(rotateSchema),
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      const authReq = req as AuthenticatedRequest;
      const oldKeyId = authReq.user?.api_key_id;
      if (!oldKeyId) {
        sendProblem(res, 400, 'PLATFORM_ADMIN_KEY_ID_MISSING');
        return;
      }
      const body = (req.body ?? {}) as { name?: string; expiresInDays?: number };
      const name = body.name ?? `rotated-${new Date().toISOString().slice(0, 10)}`;
      const expiresInDays = body.expiresInDays ?? PLATFORM_ADMIN_KEY_MAX_TTL_DAYS;

      try {
        const newKey = await rotatePlatformAdminKey(oldKeyId, name, expiresInDays, null);
        // 旧密钥立即吊销写入 Redis 缓存，跨 Pod 立即生效
        await markApiKeyRevoked(oldKeyId);
        res.status(201).json({
          success: true,
          data: {
            id: newKey.id,
            name: newKey.name,
            keyPrefix: newKey.keyPrefix,
            createdAt: newKey.createdAt,
            expiresAt: newKey.expiresAt,
            // 明文密钥仅此刻返回，请妥善保存（服务端不再可见）
            apiKey: newKey.plaintext,
            rotatedFromKeyId: oldKeyId,
          },
        });
      } catch (err) {
        if ((err as Error).message === 'PLATFORM_ADMIN_KEY_NOT_FOUND') {
          sendProblem(res, 404, 'PLATFORM_ADMIN_KEY_NOT_FOUND');
          return;
        }
        throw err;
      }
    },
    {
      logMsg: '[adminKeyRoutes] 轮换平台密钥失败',
      code: 'PLATFORM_ADMIN_KEY_ROTATE_FAILED',
    },
  ),
);

/**
 * DELETE /api/v1/admin/keys/:id
 * 吊销指定的平台 break-glass 密钥（立即生效，Redis 吊销缓存）。
 */
router.delete(
  '/admin/keys/:id',
  jwtAuth,
  auditLog,
  requirePlatformAdmin,
  crudRouteHandler(
    async (req: Request, res: Response): Promise<void> => {
      if (!requireUuidParam(res, req.params.id)) return;
      const keyId = req.params.id;
      const ok = await revokePlatformAdminKey(keyId);
      if (!ok) {
        sendProblem(res, 404, 'PLATFORM_ADMIN_KEY_NOT_FOUND');
        return;
      }
      // 立即写入 Redis 吊销缓存，跨 Pod 即时生效
      await markApiKeyRevoked(keyId);
      logger.warn({ keyId }, '[adminKeyRoutes] 已吊销平台 break-glass 密钥');
      res.json({ success: true, data: { id: keyId, revoked: true } });
    },
    {
      logMsg: '[adminKeyRoutes] 吊销平台密钥失败',
      code: 'PLATFORM_ADMIN_KEY_REVOKE_FAILED',
    },
  ),
);

/**
 * GET /api/v1/admin/keys
 * 列出全部平台 break-glass 密钥（含已吊销，审计用）。
 */
router.get(
  '/admin/keys',
  jwtAuth,
  auditLog,
  requirePlatformAdmin,
  jsonRoute('[adminKeyRoutes] 列出平台密钥失败', 'PLATFORM_ADMIN_KEY_LIST_FAILED', async () =>
    listPlatformAdminKeys(),
  ),
);

export default router;
