import type { Response, NextFunction } from 'express';
import { sendProblem } from '../utils/errors.js';
import { withTimeout, TimeoutError } from '../utils/misc.js';
import { verifyApiKey } from '../infrastructure/apiKeyVerifier.js';
import {
  authLog,
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
    authLog('info', 'optionalJwtAuth', req, '无有效 Bearer Token/API Key，匿名放行');
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
      authLog('info', middleware, req, 'API Key 认证通过', {
        userId: hashUserId(req.user?.sub),
        role: req.user?.role,
        tenantId: req.user?.tenant_id,
        platformAdmin: req.user?.platform_admin === true,
      });
      next();
      return;
    }
    if (optional) {
      req.user = null;
      authLog('info', 'optionalJwtAuth', req, '无有效 Bearer Token/API Key，匿名放行');
      next();
      return;
    }
    denyAuth(req, res, 'INVALID_API_KEY', 'API Key 无效', { middleware });
  } catch (err) {
    if (optional && err instanceof TimeoutError) {
      authLog('warn', middleware, req, 'API Key 解析超时（5s），返回 504');
      sendProblem(res, 504, 'GATEWAY_TIMEOUT', 'API Key Resolution Timeout', {
        detail: 'The API key resolution service did not respond within 5 seconds',
      });
      return;
    }
    authLog('error', middleware, req, 'API Key 验证基础设施错误，fail-closed 503', { err });
    sendProblem(res, 503, 'AUTH_SERVICE_UNAVAILABLE', 'Authentication Service Unavailable', {
      detail: 'API key validation service is temporarily unavailable',
    });
  }
}
