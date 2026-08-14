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

function computeChain(permission: Permission): RequestHandler[] {
  return [
    jwtAuth,
    resolveTenant,
    requireTenant,
    requirePermission(permission),
    computeQuotaHandler,
    auditLog,
  ];
}

export const computeMiddleware = (permission: Permission) => computeChain(permission);
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
