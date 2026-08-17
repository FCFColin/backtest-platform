/** 租户解析中间件（ADR-009）：把 JWT tenant_id 解析到 req.tenantId，供 RLS 事务使用。软解析放行，requireTenant 强制。 */
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest, TenantedRequest } from './jwtAuth.js';
import { sendProblem } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { isUuid } from '../utils/misc.js';

export function resolveTenant(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const tenantId = req.user?.tenant_id;
  if (typeof tenantId === 'string' && isUuid(tenantId)) {
    req.tenantId = tenantId;
  } else if (tenantId) {
    logger.warn({ path: req.path }, '[tenantContext] JWT tenant_id 格式非法，已忽略');
  }
  next();
}

export function hasTenant(req: AuthenticatedRequest): req is TenantedRequest {
  return typeof req.tenantId === 'string' && req.tenantId.length > 0;
}

export function requireTenant(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    sendProblem(res, 400, 'NO_ACTIVE_TENANT');
    return;
  }
  next();
}
