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
    idempotencyKey,
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

// 写面链：鉴权 + 租户解析 + 权限门槛 + 审计 + 幂等键，admin/platform-admin 复用同构链
function writeChain(auth: RequestHandler): RequestHandler[] {
  return [jwtAuth, resolveTenant, auth, auditLog, idempotencyKey];
}
export const adminMiddleware = () => writeChain(requirePermission(Permission.ADMIN_ACCESS));
export const platformAdminMiddleware = () => writeChain(requirePlatformAdmin);
