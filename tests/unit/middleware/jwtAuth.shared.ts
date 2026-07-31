import { vi } from 'vitest';
import {
  createLoggerMocks,
  createRedisModuleMock,
  createJwtAuthConfigMocks,
  type JwtAuthConfigMocks,
} from '../../helpers/mockFactories.js';
import { createJwtAuthUserRepoMock } from '../../helpers/authFixtures.js';
import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';

/**
 * jwt-auth.test.ts / token-refresh.test.ts 共享的 mock 配置与 setup helper。
 *
 * 拆分前 jwt-auth.test.ts 为 934 行，两个拆分文件共用同一套 vi.mock 样板。
 * vitest 的 vi.mock 会提升执行，且 hoisted 变量不能直接 export（参见
 * tests/helpers/dataManageRoutesFixtures.ts 既有模式），因此统一放入
 * internalMocks 容器，vi.mock 工厂与对外导出均通过属性引用获取。
 */
const internalMocks = vi.hoisted(() => ({
  configContainer: { config: {} as JwtAuthConfigMocks },
  redis: {} as Record<string, unknown>,
  fs: { readFileSync: vi.fn() },
  apiKey: { verifyApiKey: vi.fn(async () => null) },
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: Object.assign(internalMocks.configContainer.config, createJwtAuthConfigMocks()),
  validateConfig: vi.fn(),
}));
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: createLoggerMocks() }));
vi.mock('../../../packages/backend/src/infrastructure/redisClient.js', () =>
  createRedisModuleMock(
    { withStore: true, withSets: true, withHandlers: true, withMemoryHelpers: true },
    internalMocks.redis,
  ),
);
vi.mock('../../../packages/backend/src/repositories/userRepo.js', () => ({
  getUserById: createJwtAuthUserRepoMock(),
}));
vi.mock('../../../packages/backend/src/infrastructure/apiKeyVerifier.js', () => ({
  verifyApiKey: internalMocks.apiKey.verifyApiKey,
}));
vi.mock('fs', () => ({
  default: { readFileSync: internalMocks.fs.readFileSync },
  readFileSync: internalMocks.fs.readFileSync,
}));

export const mocks = internalMocks.configContainer;
export const redisMocks = internalMocks.redis;
export const fsMocks = internalMocks.fs;
export const apiKeyMocks = internalMocks.apiKey;

/**
 * 设置 getUserById 的 mock 返回指定用户（默认活跃 admin）
 *
 * @param isActive - 用户是否激活（默认 true）
 * @param role - 用户角色（默认 'admin'）
 */
export function mockUser(isActive = true, role: 'admin' | 'readonly' = 'admin'): void {
  vi.mocked(getUserById).mockImplementation(async (id: string) => ({
    id,
    username: 'test-user',
    role,
    createdAt: new Date(),
    isActive,
  }));
}
