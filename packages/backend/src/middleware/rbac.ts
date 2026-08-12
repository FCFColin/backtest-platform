import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './jwtAuth.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { recordAuthFailure, getRoutePattern } from '../utils/metrics.js';

enum Role {
  ADMIN = 'admin',
  ANALYST = 'analyst',
  READONLY = 'readonly',
}

export enum Permission {
  BACKTEST_RUN = 'backtest:run',
  DATA_MANAGE = 'data:manage',
  DATA_READ = 'data:read',
  ADMIN_ACCESS = 'admin:access',
  OPTIMIZER_RUN = 'optimizer:run',
  SIGNAL_READ = 'signal:read',
  STRATEGY_MANAGE = 'strategy:manage',
}

const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  [Role.ADMIN]: new Set(Object.values(Permission)),
  [Role.ANALYST]: new Set([
    Permission.BACKTEST_RUN,
    Permission.DATA_READ,
    Permission.DATA_MANAGE,
    Permission.OPTIMIZER_RUN,
    Permission.SIGNAL_READ,
    Permission.STRATEGY_MANAGE,
  ]),
  [Role.READONLY]: new Set([Permission.DATA_READ, Permission.SIGNAL_READ]),
};

function assertRbacConfig(): void {
  if (Object.keys(ROLE_PERMISSIONS).length === 0) {
    throw new Error('[RBAC] Permission matrix is empty — check configuration');
  }
  for (const role of Object.values(Role)) {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms || perms.size === 0) {
      throw new Error(`[RBAC] Role "${role}" has no permissions defined — check configuration`);
    }
  }
  const validPermissions = new Set<string>(Object.values(Permission));
  for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
    for (const perm of perms) {
      if (!validPermissions.has(perm as string)) {
        throw new Error(
          `[RBAC] Role "${role}" references unknown permission "${String(perm)}" — check configuration`,
        );
      }
    }
  }
}

assertRbacConfig();

function hasPermission(role: Role | string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  return perms ? perms.has(permission) : false;
}

// 多租户下角色以"用户在当前活跃组织内的成员角色"为准（ADR-032），
function effectiveRole(user: NonNullable<AuthenticatedRequest['user']>): string {
  const orgRole = user.org_role;
  if (orgRole) return orgRole === 'owner' ? Role.ADMIN : orgRole;
  return user.role;
}

function logRbac(
  level: 'info' | 'warn',
  req: AuthenticatedRequest,
  permission: Permission,
  message: string,
  extra?: Record<string, unknown>,
): void {
  logger[level](
    {
      middleware: 'rbac',
      permission,
      userId: req.user?.sub,
      role: req.user?.role,
      path: req.path,
      requestId: req.id,
      ...extra,
    },
    `[rbac] ${message}`,
  );
}

function authorizePrelude(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
  permission: Permission,
  logLabel: string,
): 'allowed' | 'denied' | 'continue' {
  logRbac('info', req, permission, logLabel);
  if (!req.user) {
    recordAuthFailure(getRoutePattern(req), 'missing_auth');
    sendProblem(res, 401, 'MISSING_AUTH');
    return 'denied';
  }
  if (req.user.platform_admin === true) {
    logRbac('info', req, permission, '平台管理员放行', { platformAdmin: true });
    next();
    return 'allowed';
  }
  return 'continue';
}

function denyInsufficientPermission(
  req: AuthenticatedRequest,
  res: Response,
  permission: Permission,
  message: string,
): void {
  logRbac('warn', req, permission, message);
  recordAuthFailure(getRoutePattern(req), 'insufficient_permission');
  sendProblem(res, 403, 'INSUFFICIENT_PERMISSION');
}

export function requirePermission(permission: Permission) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const prelude = authorizePrelude(req, res, next, permission, '权限检查');
    if (prelude !== 'continue') return;
    const userRole = effectiveRole(req.user!) as Role;
    if (!hasPermission(userRole, permission)) {
      denyInsufficientPermission(req, res, permission, '权限不足，访问拒绝');
      return;
    }
    next();
  };
}

/** 平台运维面（/admin/stats、/admin/system）：仅 platform_admin 可访问，组织 admin 不适用。 */
export function requirePlatformAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.platform_admin !== true) {
    denyInsufficientPermission(req, res, Permission.ADMIN_ACCESS, '平台管理面拒绝非平台管理员');
    return;
  }
  next();
}
