import { vi } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import {
  createRedisModuleMock,
  createJwtAuthConfigMocks,
  type JwtAuthConfigMocks,
} from '../../helpers/mockFactories.js';
import '../../helpers/loggerMock.js';
import { createJwtAuthUserRepoMock } from '../../helpers/authFixtures.js';
import { getUserById } from '../../../packages/backend/src/repositories/userRepo.js';

/** jwt-auth.test.ts / token-refresh.test.ts 共享的 mock 配置与 setup helper */
const internalMocks = vi.hoisted(() => ({
  configContainer: { config: {} as JwtAuthConfigMocks },
  redis: {} as Record<string, unknown>,
  fs: { readFileSync: vi.fn() },
  apiKey: { verifyApiKey: vi.fn(async () => null) },
  membership: {
    getMembership: vi.fn(),
    orgRoleToGlobalRole: vi.fn((role: string) => (role === 'owner' ? 'admin' : role)),
  },
}));

vi.mock('../../../packages/backend/src/config/index.js', () => ({
  config: Object.assign(internalMocks.configContainer.config, createJwtAuthConfigMocks()),
  validateConfig: vi.fn(),
}));
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
vi.mock('../../../packages/backend/src/application/org/membershipService.js', () => ({
  getMembership: internalMocks.membership.getMembership,
  orgRoleToGlobalRole: internalMocks.membership.orgRoleToGlobalRole,
}));
vi.mock('fs', () => ({
  default: { readFileSync: internalMocks.fs.readFileSync },
  readFileSync: internalMocks.fs.readFileSync,
}));

export const mocks = internalMocks.configContainer;
export const redisMocks = internalMocks.redis;
export const fsMocks = internalMocks.fs;
export const apiKeyMocks = internalMocks.apiKey;
export const membershipMocks = internalMocks.membership;

/** 让带 tenantId 的 refresh 通过成员资格复核（默认 owner/admin） */
export function mockMembershipActive(
  role: 'owner' | 'admin' | 'analyst' | 'readonly' = 'owner',
  orgStatus = 'active',
): void {
  vi.mocked(membershipMocks.getMembership).mockImplementation(
    async (_userId: string, orgId: string) => ({
      orgId,
      orgName: 'Test Org',
      orgSlug: 'test-org',
      orgPlan: 'free',
      orgStatus,
      role,
    }),
  );
}

/** 设置 getUserById 的 mock 返回指定用户（默认活跃 admin） */
export function mockUser(isActive = true, role: 'admin' | 'readonly' = 'admin'): void {
  vi.mocked(getUserById).mockImplementation(async (id: string) => ({
    id,
    username: 'test-user',
    role,
    createdAt: new Date(),
    isActive,
  }));
}

/** 生成 RS256 密钥对并写入 mocks.config */
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

/** 清空 PEM 配置，恢复无密钥基线 */
export function resetRsaConfig(): void {
  mocks.config.JWT_PRIVATE_KEY = '';
  mocks.config.JWT_PRIVATE_KEY_FILE = '';
  mocks.config.JWT_PUBLIC_KEY = '';
  mocks.config.JWT_PUBLIC_KEY_FILE = '';
}

/** 重新加载 jwtAuth 模块 */
export async function reloadJwtAuthModule() {
  vi.resetModules();
  return import('../../../packages/backend/src/middleware/jwtAuth.js');
}
