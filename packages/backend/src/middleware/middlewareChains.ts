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
    // 幂等前置：重放/在途请求在计费与审计前短路返回，避免配额双计与重复审计
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

// 写面链：鉴权 + 租户解析 + 权限门槛 + 幂等键 + 审计，admin/platform-admin 复用同构链；
// 幂等前置（与 computeChain 一致）：重放请求在审计前短路返回，避免重复审计
function writeChain(auth: RequestHandler): RequestHandler[] {
  return [jwtAuth, resolveTenant, auth, idempotencyKey, auditLog];
}
export const adminMiddleware = () => writeChain(requirePermission(Permission.ADMIN_ACCESS));
export const platformAdminMiddleware = () => writeChain(requirePlatformAdmin);
