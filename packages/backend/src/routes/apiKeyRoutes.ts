// API Key 管理路由 — 组织密钥（ADR-009）+ 平台 break-glass 密钥（P0-04）
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/miscMiddleware.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { jwtAuth, type AuthenticatedRequest } from '../middleware/jwtAuth.js';
import { auditLog } from '../middleware/auditMiddleware.js';
import { crudMiddleware } from '../middleware/middlewareChains.js';
import { Permission, requirePlatformAdmin } from '../middleware/rbac.js';
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
import {
  tenantHandler,
  requireUuidParam,
  crudRouteHandler,
  jsonRoute,
  sendData,
  sendCreated,
} from './routeUtils.js';

const router = Router();

const createKeySchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(120, '名称过长'),
});

router.post(
  '/keys',
  ...crudMiddleware(Permission.ADMIN_ACCESS),
  auditLog,
  validate(createKeySchema),
  tenantHandler(
    '[apiKeyRoutes] 创建 API Key 失败',
    'API_KEY_CREATE_FAILED',
    async (req, res, orgId) => {
      const createdBy = req.user?.sub?.startsWith('apikey:') ? null : (req.user?.sub ?? null);
      const key = await createApiKey(orgId, (req.body as { name: string }).name, createdBy);
      sendCreated(res, {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        createdAt: key.createdAt,
        apiKey: key.plaintext,
      });
    },
  ),
);

router.get(
  '/keys',
  ...crudMiddleware(Permission.ADMIN_ACCESS),
  tenantHandler(
    '[apiKeyRoutes] 列出 API Key 失败',
    'API_KEY_LIST_FAILED',
    async (_req, res, orgId) => {
      sendData(res, await listApiKeys(orgId));
    },
  ),
);

router.delete(
  '/keys/:id',
  ...crudMiddleware(Permission.ADMIN_ACCESS),
  auditLog,
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
      await markApiKeyRevoked(keyId);
      sendData(res, { id: keyId, revoked: true });
    },
  ),
);

const rotateSchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(120, '名称过长').optional(),
  expiresInDays: z.number().int().min(1).max(PLATFORM_ADMIN_KEY_MAX_TTL_DAYS).optional(),
});

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
        await markApiKeyRevoked(oldKeyId);
        sendCreated(res, {
          id: newKey.id,
          name: newKey.name,
          keyPrefix: newKey.keyPrefix,
          createdAt: newKey.createdAt,
          expiresAt: newKey.expiresAt,
          apiKey: newKey.plaintext,
          rotatedFromKeyId: oldKeyId,
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
      await markApiKeyRevoked(keyId);
      logger.warn({ keyId }, '[adminKeyRoutes] 已吊销平台 break-glass 密钥');
      sendData(res, { id: keyId, revoked: true });
    },
    {
      logMsg: '[adminKeyRoutes] 吊销平台密钥失败',
      code: 'PLATFORM_ADMIN_KEY_REVOKE_FAILED',
    },
  ),
);

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
