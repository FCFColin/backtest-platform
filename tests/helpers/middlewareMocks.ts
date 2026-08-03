import { vi } from 'vitest';

/**
 * 路由测试共享的中间件透传 mock（jwtAuth/tenantContext/rbac/quota）。
 * 顶层 vi.mock 生效于所有 import 本模块的测试文件（同 dataService.shared.ts 模式）。
 */
vi.mock('../../packages/backend/src/middleware/jwtAuth.js', () => ({
  jwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalJwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  assignGuestReadonly: (_req: unknown, _res: unknown, next: () => void) => next(),
  auditLog: (_req: unknown, _res: unknown, next: () => void) => next(),
  idempotencyKey: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../packages/backend/src/middleware/tenantContext.js', () => ({
  resolveTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  hasTenant: vi.fn(() => true),
}));
vi.mock('../../packages/backend/src/middleware/rbac.js', () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  Permission: {},
}));
vi.mock('../../packages/backend/src/middleware/quota.js', () => ({
  enforceQuota: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
