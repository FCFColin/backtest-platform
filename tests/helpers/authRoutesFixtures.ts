/**
 * authRoutes 测试共享 mock 工厂
 *
 * 企业理由：auth-routes.login.test.ts 与 auth-routes.misc.test.ts 重复定义相同的
 * config/jwtAuth/userService/loginLockout/membershipService mock 对象（~60 行）。
 * 本模块集中维护这些 mock 工厂，采用 target-mutation 模式（与 createRedisMocks 一致），
 * 供 vi.mock 工厂内调用。
 *
 * 用法：
 *   const mocks = vi.hoisted(() => ({ jwtAuth: {} as Record<string, unknown>, ... }));
 *   vi.mock('.../jwtAuth.js', () => createAuthJwtAuthMocks(mocks.jwtAuth));
 */
import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/** authRoutes 测试 config 默认值（纯数据，无 vi.fn） */
export function createAuthRoutesConfig() {
  return {
    NODE_ENV: 'production' as string,
    ADMIN_API_KEY: 'test-secret-key-123' as string,
    JWT_SECRET: 'test-jwt-secret',
    JWT_ALGORITHM: 'HS256',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 604800,
    JWT_PRIVATE_KEY: '',
    JWT_PRIVATE_KEY_FILE: '',
    JWT_PUBLIC_KEY: '',
    JWT_PUBLIC_KEY_FILE: '',
  };
}

/** jwtAuth 模块 mock — 写入 target 并返回（generateToken/generateRefreshToken/refreshAccessToken/revokeRefreshToken/revokeAllUserSessions/jwtAuth） */
export function createAuthJwtAuthMocks(target: Record<string, unknown> = {}) {
  target.generateToken = vi.fn();
  target.generateRefreshToken = vi.fn();
  target.refreshAccessToken = vi.fn();
  target.revokeRefreshToken = vi.fn();
  target.revokeAllUserSessions = vi.fn();
  target.jwtAuth = vi.fn((_req: Request, _res: Response, next: NextFunction) => next());
  return target;
}

/** userService mock — 写入 target 并返回（verifyUser/anonymizeUser） */
export function createAuthUserServiceMocks(target: Record<string, unknown> = {}) {
  target.verifyUser = vi.fn();
  target.anonymizeUser = vi.fn();
  return target;
}

/** loginLockout mock — 写入 target 并返回（isLockedOut/recordFailure/clearFailures） */
export function createLoginLockoutMocks(target: Record<string, unknown> = {}) {
  target.isLockedOut = vi.fn().mockResolvedValue(0);
  target.recordFailure = vi.fn().mockResolvedValue(undefined);
  target.clearFailures = vi.fn().mockResolvedValue(undefined);
  return target;
}

/** membershipService mock — 写入 target 并返回（resolveDefaultOrg/getMembership/getUserMemberships/isPlatformAdmin/orgRoleToGlobalRole） */
export function createMembershipServiceMocks(target: Record<string, unknown> = {}) {
  target.resolveDefaultOrg = vi.fn().mockResolvedValue(null);
  target.getMembership = vi.fn().mockResolvedValue(null);
  target.getUserMemberships = vi.fn().mockResolvedValue([]);
  target.isPlatformAdmin = vi.fn().mockResolvedValue(false);
  target.orgRoleToGlobalRole = (r: string) => (r === 'owner' ? 'admin' : r);
  return target;
}
