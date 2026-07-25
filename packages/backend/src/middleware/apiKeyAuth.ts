/**
 * API Key 认证中间件
 *
 * 企业理由：保留 x-api-key 兼容模式，确保现有自动化脚本和内部工具无需立即迁移。
 * 解析优先级（P0-04 后统一走 DB）：
 * 1. 按组织的 DB 密钥（api_keys 表，is_platform_admin=FALSE）——主路径。命中则注入租户上下文。
 * 2. 平台 break-glass DB 密钥（api_keys 表，is_platform_admin=TRUE）——仅用于平台运维应急，
 *    由 DB 管理可轮换/可吊销/可限期。不再从环境变量读取（P0-04：ADMIN_API_KEY 仅作首次启动 bootstrap）。
 */

import type { Response, NextFunction } from 'express';
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
 * 将 x-api-key 解析为认证用户上下文（ADR-033 + P0-04）。
 *
 * 平台 break-glass 密钥与按组织密钥均入库管理（is_platform_admin 区分），
 * 统一受生命周期（expires_at）、吊销（revoked_at + Redis 缓存）、argon2id 哈希约束。
 * 平台密钥命中时注入 `platform_admin: true` 且不绑定租户。
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
    const verified = await verifyApiKey(apiKey);
    if (!verified) return null;

    // 平台 break-glass 密钥：注入 platform_admin 角色，不绑定租户
    if (verified.isPlatformAdmin) {
      return {
        sub: 'platform:break-glass',
        role: 'admin',
        platform_admin: true,
        api_key_id: verified.keyId,
        iat: nowSec,
        exp: nowSec + ACCESS_TOKEN_EXPIRES_IN_SEC,
      };
    }

    // 按组织密钥：注入租户上下文，交由 RLS 隔离数据
    return {
      sub: `apikey:${verified.keyId}`,
      role: 'analyst',
      tenant_id: verified.orgId ?? undefined,
      org_role: 'analyst',
      api_key_id: verified.keyId,
      iat: nowSec,
      exp: nowSec + ACCESS_TOKEN_EXPIRES_IN_SEC,
    };
  } catch {
    return null;
  }
}

/** 处理 x-api-key 兼容认证（DB 按组织密钥 + 平台 break-glass 密钥，ADR-033 + P0-04） */
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
        platformAdmin: req.user.platform_admin === true,
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

/** API Key 解析超时时间（毫秒），超时后返回 504 防止请求永久阻塞 */
const API_KEY_RESOLUTION_TIMEOUT_MS = 5000;

/**
 * 可选模式：处理 x-api-key，失败时匿名放行，超时返回 504（P0-04 修复）。
 *
 * 修复前：`void resolveApiKeyUser(apiKey).then(...)` 是 fire-and-forget，
 * 无 catch 无超时——Promise reject 会导致 unhandledRejection，且请求可能永久挂起。
 *
 * 修复后：async/await + try/catch + Promise.race 5s 超时保护。
 * 超时：返回 504 Gateway Timeout（系统问题，不应静默放行）。
 * 异常：传递给 Express 错误处理器 next(err)。
 *
 * @param req - 认证请求对象
 * @param res - Express 响应对象（用于超时时发送 504）
 * @param next - Express next 函数
 */
export async function handleOptionalApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

  try {
    // P0-04：超时保护——resolveApiKeyUser 可能因 DB/Redis 不可用而挂起，
    // 5s 超时后返回 504，避免请求永久阻塞。
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('API_KEY_RESOLUTION_TIMEOUT')),
        API_KEY_RESOLUTION_TIMEOUT_MS,
      );
    });

    const user = await Promise.race([resolveApiKeyUser(apiKey), timeoutPromise]);

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
          platformAdmin: req.user.platform_admin === true,
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
  } catch (err) {
    if (err instanceof Error && err.message === 'API_KEY_RESOLUTION_TIMEOUT') {
      // P0-04：超时返回 504，不静默放行（超时是系统问题而非无效密钥）
      logger.warn(
        { middleware: 'optionalJwtAuth', path: req.path, requestId: req.id },
        '[jwtAuth] API Key 解析超时（5s），返回 504',
      );
      sendProblem(res, 504, 'GATEWAY_TIMEOUT', 'API Key Resolution Timeout', {
        detail: 'The API key resolution service did not respond within 5 seconds',
      });
      return;
    }
    // P0-04：其他异常传递给 Express 错误处理器，不再 fire-and-forget
    logger.error(
      { middleware: 'optionalJwtAuth', path: req.path, requestId: req.id, err },
      '[jwtAuth] API Key 解析异常，传递给错误处理器',
    );
    next(err);
  }
}
