import { vi } from 'vitest';
import { createLoggerMocks } from './mockFactories.js';

/**
 * 路由测试共享的透传 mock（jwtAuth/tenantContext/rbac/quota/redisClient/logger）。
 * 顶层 vi.mock 生效于所有 import 本模块的测试文件。
 * 导出 loggerMocks 供测试文件引用 logger 断言。
 */
export const loggerMocks = createLoggerMocks();

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
vi.mock('../../packages/backend/src/infrastructure/redisClient.js', () => ({
  redisConnection: { on: () => {} },
  bullmqConnectionOptions: {},
  appRedis: {
    on: () => {},
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    expire: vi.fn(),
    scan: vi.fn().mockResolvedValue(['0', []] as [string, string[]]),
  },
  getRedisHealth: vi.fn().mockResolvedValue(true),
  markRedisUnhealthy: vi.fn(),
  buildRedisBaseOptions: () => ({ host: 'localhost', port: 6379 }),
  isSentinelMode: false,
}));
vi.mock('../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));
