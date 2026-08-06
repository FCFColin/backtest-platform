import { vi } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import {
  createRedisModuleMock,
  createJwtAuthConfigMocks,
  type JwtAuthConfigMocks,
} from '../../helpers/mockFactories.js';
import { loggerMocks } from '../../helpers/loggerFixture.js';
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
vi.mock('../../../packages/backend/src/utils/logger.js', () => ({ logger: loggerMocks }));
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

/** 生成 RS256 密钥对并写入 mocks.config（PEM 内联），返回密钥供测试签发 */
export async function setupRsaKeys(env = 'production') {
  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  });
  const privatePem = await exportPKCS8(privateKey);
  const publicPem = await exportSPKI(publicKey);
  mocks.config.JWT_PRIVATE_KEY = privatePem;
  mocks.config.JWT_PUBLIC_KEY = publicPem;
  mocks.config.NODE_ENV = env;
  mocks.config.JWT_ALGORITHM = 'RS256';
  return { publicKey, privateKey, privatePem, publicPem };
}

/** 清空 PEM 配置（内联 + 文件路径），恢复无密钥基线 */
export function resetRsaConfig(): void {
  mocks.config.JWT_PRIVATE_KEY = '';
  mocks.config.JWT_PRIVATE_KEY_FILE = '';
  mocks.config.JWT_PUBLIC_KEY = '';
  mocks.config.JWT_PUBLIC_KEY_FILE = '';
}

/** 重置模块缓存并重新加载 jwtAuth 模块（读取最新 mocks.config） */
export async function reloadJwtAuthModule() {
  vi.resetModules();
  return import('../../../packages/backend/src/middleware/jwtAuth.js');
}
