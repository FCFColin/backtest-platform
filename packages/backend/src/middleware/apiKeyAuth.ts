/**
 * API Key 认证中间件
 *
 * 企业理由：保留 x-api-key 兼容模式，确保现有自动化脚本和内部工具无需立即迁移。
 * 解析优先级：
 * 1. 按组织的 DB 密钥（api_keys 表）——主路径。命中则注入租户上下文。
 * 2. 可选的 ADMIN_API_KEY 破窗（break-glass）平台密钥——仅用于平台运维应急。
 */

import crypto from 'crypto';
import { Buffer } from 'buffer';
import type { Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { verifyApiKey } from '../infrastructure/apiKeyVerifier.js';
import {
  type AuthenticatedRequest,
  type JwtPayload,
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  attachAuthLogContext,
  hashUserId,
} from './authTypes.js';

/**
 * 将 x-api-key 解析为认证用户上下文（ADR-033）。
 *
 * 解析优先级：
 * 1. 按组织的 DB 密钥（api_keys 表）——主路径。命中则注入租户上下文
 *    `{ sub: 'apikey:<keyId>', role/org_role: 'analyst', tenant_id: orgId }`，
 *    交由 RLS 隔离数据。
 * 2. 可选的 `ADMIN_API_KEY` 破窗（break-glass）平台密钥——仅用于平台运维应急，
 *    注入 `platform_admin: true` 且不绑定租户。生产应优先用按组织密钥，
 *    将 ADMIN_API_KEY 视为最后手段并妥善保管。
 *
 * @param apiKey - 客户端提供的明文 x-api-key
 * @returns 解析出的 JwtPayload，无效或异常时返回 null
 */
async function resolveApiKeyUser(apiKey: string): Promise<JwtPayload | null> {
  if (typeof apiKey !== 'string' || apiKey.length === 0 || apiKey.length > 128) {
    return null;
  }
  const nowSec = Math.floor(Date.now() / 1000);

  try {
    // 1) 按组织的 DB 密钥（主路径）
    const verified = await verifyApiKey(apiKey);
    if (verified) {
      return {
        sub: `apikey:${verified.keyId}`,
        role: 'analyst',
        tenant_id: verified.orgId,
        org_role: 'analyst',
        iat: nowSec,
        exp: nowSec + ACCESS_TOKEN_EXPIRES_IN_SEC,
      };
    }

    // 2) 可选 ADMIN_API_KEY 破窗平台密钥
    if (config.ADMIN_API_KEY && apiKey.length === config.ADMIN_API_KEY.length) {
      const a = Buffer.from(apiKey, 'utf-8');
      const b = Buffer.from(config.ADMIN_API_KEY, 'utf-8');
      if (crypto.timingSafeEqual(a, b)) {
        return {
          sub: 'platform:break-glass',
          role: 'admin',
          platform_admin: true,
          iat: nowSec,
          exp: nowSec + ACCESS_TOKEN_EXPIRES_IN_SEC,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** 处理 x-api-key 兼容认证（DB 按组织密钥 + 可选破窗平台密钥，ADR-033） */
export async function handleApiKeyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) return;

  const user = await resolveApiKeyUser(apiKey);
  if (user) {
    req.user = user;
    attachAuthLogContext(req);
    logger.info(
      {
        middleware: 'jwtAuth',
        path: req.path,
        userId: hashUserId(req.user.sub),
        role: req.user.role,
        tenantId: req.user.tenant_id,
        requestId: req.id,
      },
      '[jwtAuth] API Key 认证通过',
    );
    next();
    return;
  }
  logger.warn(
    { middleware: 'jwtAuth', path: req.path, error: 'API Key 无效', requestId: req.id },
    '[jwtAuth] JWT 认证失败',
  );
  sendProblem(res, 401, 'INVALID_API_KEY');
}

/** 可选模式：处理 x-api-key，失败时匿名放行 */
export function handleOptionalApiKey(req: AuthenticatedRequest, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    req.user = null;
    logger.info(
      { middleware: 'optionalJwtAuth', path: req.path, requestId: req.id },
      '[jwtAuth] 无有效 Bearer Token/API Key，匿名放行',
    );
    next();
    return;
  }
  void resolveApiKeyUser(apiKey).then((user) => {
    if (user) {
      req.user = user;
      attachAuthLogContext(req);
      logger.info(
        {
          middleware: 'optionalJwtAuth',
          path: req.path,
          userId: hashUserId(req.user.sub),
          role: req.user.role,
          tenantId: req.user.tenant_id,
          requestId: req.id,
        },
        '[jwtAuth] API Key 认证通过',
      );
    } else {
      req.user = null;
      logger.info(
        { middleware: 'optionalJwtAuth', path: req.path, requestId: req.id },
        '[jwtAuth] 无有效 Bearer Token/API Key，匿名放行',
      );
    }
    next();
  });
}
