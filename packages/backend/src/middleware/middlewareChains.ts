import type { RequestHandler } from 'express';
import {
  optionalJwtAuth,
  assignGuestReadonly,
  jwtAuth,
  auditLog,
  idempotencyKey,
} from './jwtAuth.js';
import { resolveTenant, requireTenant } from './tenantContext.js';
import { requirePermission, requirePlatformAdmin, Permission } from './rbac.js';
import { enforceQuota } from './quota.js';
import { USAGE_METRIC } from '../config/index.js';

const computeQuotaHandler = enforceQuota(USAGE_METRIC.BACKTEST);

function computeChain(permission: Permission): RequestHandler[] {
  return [
    jwtAuth,
    resolveTenant,
    requireTenant,
    requirePermission(permission),
    idempotencyKey,
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

function writeChain(auth: RequestHandler): RequestHandler[] {
  return [jwtAuth, resolveTenant, auth, idempotencyKey, auditLog];
}
export const adminMiddleware = () => writeChain(requirePermission(Permission.ADMIN_ACCESS));
export const platformAdminMiddleware = () => writeChain(requirePlatformAdmin);
