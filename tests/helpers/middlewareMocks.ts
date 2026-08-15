import { vi } from 'vitest';
export { loggerMocks } from './loggerFixture.js';

const redisMockStore = vi.hoisted(() => new Map<string, string>());

vi.mock('../../packages/backend/src/middleware/jwtAuth.js', () => ({
  jwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  optionalJwtAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  assignGuestReadonly: (_req: unknown, _res: unknown, next: () => void) => next(),
  auditLog: (_req: unknown, _res: unknown, next: () => void) => next(),
  idempotencyKey: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireUser: (
    req: { user?: unknown },
    res: { status: (n: number) => { json: (b: unknown) => void } },
  ) => {
    if (req?.user) return true;
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
    return false;
  },
}));
vi.mock('../../packages/backend/src/middleware/tenantContext.js', () => ({
  resolveTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireTenant: (_req: unknown, _res: unknown, next: () => void) => next(),
  hasTenant: vi.fn(() => true),
}));
vi.mock('../../packages/backend/src/middleware/rbac.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/backend/src/middleware/rbac.js')>();
  const PERMS = new Map<string, Set<string>>(
    Object.entries(actual.ROLE_PERMISSIONS).map(([role, perms]) => [role, new Set<string>(perms)]),
  );
  const deny = (res: { status: (n: number) => { json: (b: unknown) => void } }) =>
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
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
        if (!role || !PERMS.has(role) || PERMS.get(role)?.has(perm)) return next();
        deny(res);
      },
    Permission: actual.Permission,
    Role: actual.Role,
    requirePlatformAdmin: (
      req: { user?: { platform_admin?: boolean } },
      res: { status: (n: number) => { json: (b: unknown) => void } },
      next: () => void,
    ) => {
      if (req.user?.platform_admin === true) return next();
      deny(res);
    },
  };
});
vi.mock('../../packages/backend/src/middleware/quota.js', () => ({
  enforceQuota: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  enforceOrgActive: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../packages/backend/src/infrastructure/redisClient.js', () => ({
  bullmqConnectionOptions: { host: 'localhost', port: 6379 },
  appRedis: {
    on: () => {},
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn((key: string) => Promise.resolve(redisMockStore.get(key) ?? null)),
    set: vi.fn((key: string, value: string) =>
      Promise.resolve(redisMockStore.set(key, value) && 'OK'),
    ),
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
