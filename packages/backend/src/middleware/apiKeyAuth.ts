import type { Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { withTimeout, TimeoutError } from '../utils/misc.js';
import { verifyApiKey } from '../infrastructure/apiKeyVerifier.js';
import {
  authCtx,
  denyAuth,
  attachAuthLogContext,
  hashUserId,
  ACCESS_TOKEN_EXPIRES_IN_SEC,
  type AuthenticatedRequest,
  type JwtPayload,
} from './authShared.js';

async function resolveApiKeyUser(apiKey: string): Promise<JwtPayload | null> {
  if (typeof apiKey !== 'string' || apiKey.length === 0 || apiKey.length > 128) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  const verified = await verifyApiKey(apiKey);
  if (!verified) return null;
  const common = {
    iat: nowSec,
    exp: nowSec + ACCESS_TOKEN_EXPIRES_IN_SEC,
    api_key_id: verified.keyId,
  };
  if (verified.isPlatformAdmin)
    return { sub: 'platform:break-glass', role: 'admin', platform_admin: true, ...common };
  return {
    sub: `apikey:${verified.keyId}`,
    role: 'analyst',
    tenant_id: verified.orgId ?? undefined,
    org_role: 'analyst',
    ...common,
  };
}
function logApiKeyAuth(req: AuthenticatedRequest, middleware: string): void {
  logger.info(
    {
      ...authCtx(middleware, req),
      userId: hashUserId(req.user?.sub),
      role: req.user?.role,
      tenantId: req.user?.tenant_id,
      platformAdmin: req.user?.platform_admin === true,
    },
    '[jwtAuth] API Key 认证通过',
  );
}
function logAnonymous(req: AuthenticatedRequest): void {
  logger.info(
    { ...authCtx('optionalJwtAuth', req) },
    '[jwtAuth] 无有效 Bearer Token/API Key，匿名放行',
  );
}

const API_KEY_RESOLUTION_TIMEOUT_MS = 5000;
export async function authenticateWithApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  optional: boolean,
): Promise<void> {
  const middleware = optional ? 'optionalJwtAuth' : 'jwtAuth';
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    if (!optional) return;
    req.user = null;
    logAnonymous(req);
    next();
    return;
  }
  try {
    const user = optional
      ? await withTimeout(resolveApiKeyUser(apiKey), API_KEY_RESOLUTION_TIMEOUT_MS, 'apiKey')
      : await resolveApiKeyUser(apiKey);
    if (user) {
      req.user = user;
      attachAuthLogContext(req);
      logApiKeyAuth(req, middleware);
      next();
      return;
    }
    if (optional) {
      req.user = null;
      logAnonymous(req);
      next();
      return;
    }
    denyAuth(req, res, 'INVALID_API_KEY', 'API Key 无效', { middleware });
  } catch (err) {
    if (optional && err instanceof TimeoutError) {
      logger.warn({ ...authCtx(middleware, req) }, '[jwtAuth] API Key 解析超时（5s），返回 504');
      sendProblem(res, 504, 'GATEWAY_TIMEOUT', 'API Key Resolution Timeout', {
        detail: 'The API key resolution service did not respond within 5 seconds',
      });
      return;
    }
    logger.error(
      { ...authCtx(middleware, req), err },
      '[jwtAuth] API Key 验证基础设施错误，fail-closed 503',
    );
    sendProblem(res, 503, 'AUTH_SERVICE_UNAVAILABLE', 'Authentication Service Unavailable', {
      detail: 'API key validation service is temporarily unavailable',
    });
  }
}
export function handleApiKeyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  return authenticateWithApiKey(req, res, next, false);
}
export function handleOptionalApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  return authenticateWithApiKey(req, res, next, true);
}
