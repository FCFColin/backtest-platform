import type { RequestHandler } from 'express';
import {
  optionalJwtAuth,
  assignGuestReadonly,
  jwtAuth,
  auditLog,
  idempotencyKey,
} from './jwtAuth.js';
import { resolveTenant, requireTenant } from './tenantContext.js';
import { requirePermission, Permission } from './rbac.js';
import { enforceQuota } from './quota.js';
import { USAGE_METRIC } from '../config/index.js';

const computeQuotaHandler: RequestHandler = (req, res, next) => {
  void enforceQuota(USAGE_METRIC.BACKTEST)(req, res, next);
};

function computeChain(permission: Permission, withQuota: boolean): RequestHandler[] {
  return [
    jwtAuth,
    resolveTenant,
    requirePermission(permission),
    ...(withQuota ? [computeQuotaHandler] : []),
    auditLog,
  ];
}

export const computeMiddleware = (permission: Permission) => computeChain(permission, true);
export const computeMiddlewareNoQuota = (permission: Permission) => computeChain(permission, false);
export const crudMiddleware = (permission: Permission) => [
  jwtAuth,
  resolveTenant,
  requireTenant,
  requirePermission(permission),
];
export const readOnlyAuth: RequestHandler[] = [optionalJwtAuth, assignGuestReadonly];
export const adminMiddleware = () => [
  jwtAuth,
  resolveTenant,
  requirePermission(Permission.ADMIN_ACCESS),
  auditLog,
  idempotencyKey,
];
