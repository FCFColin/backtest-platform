import { vi } from 'vitest';
export { loggerMocks } from './loggerFixture.js';

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
vi.mock('../../packages/backend/src/middleware/rbac.js', () => {
  const PERMS: Record<string, Set<string>> = {
    admin: new Set([
      'backtest:run',
      'data:manage',
      'data:read',
      'admin:access',
      'optimizer:run',
      'signal:read',
      'strategy:manage',
    ]),
    analyst: new Set([
      'backtest:run',
      'data:read',
      'data:manage',
      'optimizer:run',
      'signal:read',
      'strategy:manage',
    ]),
    readonly: new Set(['data:read', 'signal:read']),
  };
  return {
    requirePermission:
      (perm: string) =>
      (
        req: { user?: { role?: string; org_role?: string } },
        res: { status: (n: number) => { json: (b: unknown) => void } },
        next: () => void,
      ) => {
        if (!req.user) return next();
        const role = req.user.role ?? req.user.org_role;
        if (!role || !PERMS[role] || PERMS[role].has(perm)) return next();
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      },
    Permission: {
      BACKTEST_RUN: 'backtest:run',
      DATA_MANAGE: 'data:manage',
      DATA_READ: 'data:read',
      ADMIN_ACCESS: 'admin:access',
      OPTIMIZER_RUN: 'optimizer:run',
      SIGNAL_READ: 'signal:read',
      STRATEGY_MANAGE: 'strategy:manage',
    },
    Role: { ADMIN: 'admin', ANALYST: 'analyst', READONLY: 'readonly' },
    requirePlatformAdmin: (
      req: { user?: { platform_admin?: boolean } },
      res: { status: (n: number) => { json: (b: unknown) => void } },
      next: () => void,
    ) => {
      if (req.user?.platform_admin === true) return next();
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
    },
  };
});
vi.mock('../../packages/backend/src/middleware/quota.js', () => ({
  enforceQuota: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../packages/backend/src/infrastructure/redisClient.js', () => ({
  redisConnection: { on: () => {} },
  bullmqConnectionOptions: { host: 'localhost', port: 6379 },
  appRedis: {
    on: () => {},
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(0),
    incr: vi.fn().mockResolvedValue(1),
    decr: vi.fn().mockResolvedValue(0),
    publish: vi.fn().mockResolvedValue(0),
    scan: vi.fn().mockResolvedValue(['0', []] as [string, string[]]),
  },
  getRedisHealth: vi.fn().mockResolvedValue(true),
  markRedisUnhealthy: vi.fn(),
  buildRedisBaseOptions: () => ({ host: 'localhost', port: 6379 }),
  isSentinelMode: false,
}));
