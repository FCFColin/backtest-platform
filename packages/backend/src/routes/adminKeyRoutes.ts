/**
 * 平台 break-glass 密钥管理路由（P0-04）
 *
 * 挂载于 /api/v1/admin/keys，鉴权链：jwtAuth → requirePlatformAdmin → auditLog。
 * 即仅平台 break-glass 密钥（x-api-key 鉴权，platform_admin=TRUE）可管理自身生命周期。
 * 租户内 admin 不可触碰平台密钥（防越权轮换/吊销运维应急凭证）。
 *
 * 端点：
 * - POST   /rotate          轮换当前密钥（旧密钥立即吊销，新明文一次性返回）
 * - DELETE /:id             吊销指定平台密钥（立即生效，Redis 吊销缓存）
 * - GET    /                列出全部平台密钥（含已吊销，审计用）
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { recordAuthFailure, getRoutePattern } from '../utils/metrics.js';
import type { AuthenticatedRequest } from '../middleware/jwtAuth.js';
import {
  rotatePlatformAdminKey,
  revokePlatformAdminKey,
  listPlatformAdminKeys,
  PLATFORM_ADMIN_KEY_MAX_TTL_DAYS,
} from '../repositories/apiKeyRepo.js';
import { markApiKeyRevoked } from '../infrastructure/apiKeyVerifier.js';
import { crudRouteHandler, jsonRoute, requireUuidParam } from './routeUtils.js';

const router = Router();

/**
 * 平台管理员守卫：仅 platform_admin=TRUE 的请求可管理 break-glass 密钥。
 *
 * 企业理由：break-glass 密钥是平台级运维凭证，租户内 admin（即便有 ADMIN_ACCESS）
 * 也不应能轮换/吊销它——否则被攻陷的租户管理员可禁用运维应急通道。
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
  '/rotate',
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
  '/:id',
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
  '/',
  requirePlatformAdmin,
  jsonRoute('[adminKeyRoutes] 列出平台密钥失败', 'PLATFORM_ADMIN_KEY_LIST_FAILED', async () =>
    listPlatformAdminKeys(),
  ),
);

export default router;
