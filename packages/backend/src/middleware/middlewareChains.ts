/**
 * 中间件链工厂 — 计算端点与 CRUD 端点共享的中间件编排。
 *
 * 企业理由：app.ts 与 analysisRoutes.ts 原各自维护同名 computeMiddleware /
 * computeMiddlewareNoQuota / crudMiddleware 局部定义（约 25 行重复），
 * 违反 DRY。提取到独立模块消除重复，同时避免循环依赖。
 *
 * 中间件编排语义不变，仅消除代码重复。
 */
import type { RequestHandler } from 'express';
import { optionalJwtAuth, assignGuestAnalyst, assignGuestReadonly, jwtAuth } from './jwtAuth.js';
import { resolveTenant, requireTenant } from './tenantContext.js';
import { requirePermission, Permission } from './rbac.js';
import { enforceQuota } from './quota.js';
import { auditLog } from './auditLog.js';
import { idempotencyKey } from './idempotency.js';
import { USAGE_METRIC } from '../config/planLimits.js';

const computeAuth: RequestHandler[] = [optionalJwtAuth, assignGuestAnalyst];

const computeQuotaHandler: RequestHandler = (req, res, next) => {
  void enforceQuota(USAGE_METRIC.BACKTEST)(req, res, next);
};

/**
 * 计算端点中间件链：可选认证 → 访客 analyst → 租户解析 → 权限 → 配额 → 审计。
 */
export function computeMiddleware(permission: Permission): RequestHandler[] {
  return [...computeAuth, resolveTenant, requirePermission(permission), computeQuotaHandler, auditLog];
}

/**
 * 计算端点中间件链（无配额）：可选认证 → 访客 analyst → 租户解析 → 权限 → 审计。
 * 用于不需配额的计算端点（如因子回归、计算器）。
 */
export function computeMiddlewareNoQuota(permission: Permission): RequestHandler[] {
  return [...computeAuth, resolveTenant, requirePermission(permission), auditLog];
}

/**
 * CRUD 端点中间件链：JWT 认证 → 租户解析 → 要求租户 → 权限。
 */
export function crudMiddleware(permission: Permission): RequestHandler[] {
  return [jwtAuth, resolveTenant, requireTenant, requirePermission(permission)];
}

/**
 * 只读数据端点中间件链：可选认证 → 访客只读。
 */
export const readOnlyAuth: RequestHandler[] = [optionalJwtAuth, assignGuestReadonly];

/**
 * 管理端点中间件链：JWT 认证 → 租户解析 → ADMIN 权限 → 审计 → 幂等键。
 */
export function adminMiddleware(): RequestHandler[] {
  return [jwtAuth, resolveTenant, requirePermission(Permission.ADMIN_ACCESS), auditLog, idempotencyKey];
}
