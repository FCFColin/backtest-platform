import type { Request, Response } from 'express';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendProblem } from '../utils/errors.js';
import { sha256Hex } from '../utils/crypto.js';
import { recordAuthFailure, getRoutePattern } from '../utils/metrics.js';
import type { OrgRole } from '@backtest/shared/types/org';

export type { OrgRole };
export type Role = 'admin' | 'analyst' | 'readonly';

export interface TenantContext {
  tenantId?: string;
  orgRole?: OrgRole;
  platformAdmin?: boolean;
}
export interface JwtPayload {
  sub: string;
  role: Role;
  tenant_id?: string;
  org_role?: OrgRole;
  platform_admin?: boolean;
  api_key_id?: string;
  iat: number;
  exp: number;
}
export interface AuthenticatedRequest extends Request {
  user?: JwtPayload | null;
  tenantId?: string;
}
export interface TenantedRequest extends Request {
  user?: JwtPayload | null;
  tenantId: string;
}

export const RT_COOKIE = 'rt';
export const ACCESS_TOKEN_EXPIRES_IN_SEC = config.JWT_ACCESS_TTL;

export const ROLE_TTL: Record<Role, number> = {
  readonly: config.SESSION_IDLE_TIMEOUT_READONLY_SEC,
  analyst: config.SESSION_IDLE_TIMEOUT_ANALYST_SEC,
  admin: 0,
};

export const hashUserId = (sub: string | undefined): string | undefined =>
  sub ? sha256Hex(sub).slice(0, 16) : undefined;

export function attachAuthLogContext(req: AuthenticatedRequest): void {
  const sub = req.user?.sub;
  if (!sub) return;
  const r = req as AuthenticatedRequest & {
    log?: { child: (b: Record<string, unknown>) => unknown };
  };
  if (r.log?.child)
    r.log = r.log.child({ user_id: hashUserId(sub), role: req.user?.role }) as typeof r.log;
}

type AuthLogLevel = 'info' | 'warn' | 'error';
export function authLog(
  level: AuthLogLevel,
  middleware: string,
  req: AuthenticatedRequest,
  msg: string,
  extra: Record<string, unknown> = {},
): void {
  logger[level]({ middleware, path: req.path, requestId: req.id, ...extra }, `[jwtAuth] ${msg}`);
}
export const denyAuth = (
  req: AuthenticatedRequest,
  res: Response,
  code: string,
  error: string,
  opts?: { middleware?: string; failureCode?: string; extra?: Record<string, unknown> },
): void => {
  authLog('warn', opts?.middleware ?? 'jwtAuth', req, 'JWT 认证失败', { error, ...opts?.extra });
  if (opts?.failureCode) recordAuthFailure(getRoutePattern(req), opts.failureCode);
  sendProblem(res, 401, code);
};
