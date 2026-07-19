/**
 * jwtAuth 测试共享 setup 助手
 *
 * 企业理由：4 个 jwt-auth 测试文件重复定义相同的 userRepo mock 工厂实现（~8 行）
 * 与 beforeEach 默认值重置模式（~6 行）。本模块集中维护：
 * 1. createJwtAuthUserRepoMock() — 供 vi.mock 工厂直接调用（vitest 允许工厂引用 top-level import）
 * 2. setupJwtAuthTestMocks() — 供 beforeEach 调用，重置 config + redisMocks 到 HS256 默认值
 *
 * 不能提取的部分（vitest 静态语义限制）：
 * - vi.hoisted 回调（必须在测试文件 top-level，且运行在 import 解析之前）
 * - vi.mock 调用本身（必须留在测试文件 top-level）
 * 因此各测试文件仍需保留 vi.hoisted + vi.mock 样板，仅工厂体与 beforeEach 逻辑可复用。
 */
import { vi } from 'vitest';
import type { JwtAuthConfigMocks } from './mockFactories.js';

/**
 * 创建 userRepo.getUserById 的默认 mock 实现
 *
 * 返回一个 vi.fn，模拟活跃 analyst 用户。供 jwt-auth 测试的 vi.mock 工厂使用：
 *   vi.mock('.../userRepo.js', () => ({ getUserById: createJwtAuthUserRepoMock() }));
 *
 * @returns vi.fn 实例，调用时返回 mock 用户对象
 */
export function createJwtAuthUserRepoMock() {
  return vi.fn().mockImplementation(async (id: string) => ({
    id,
    username: 'test-user',
    role: 'analyst' as const,
    isActive: true,
    createdAt: new Date(),
  }));
}

/**
 * 重置 jwtAuth HS256 测试的默认 mock 状态
 *
 * 在 beforeEach 中调用，将 config 重置为 production + HS256 + 默认 JWT_SECRET，
 * 并将 redisMocks 切换到内存模式。供所有 jwt-auth.* 测试文件的 beforeEach 复用。
 *
 * @param mocks - 测试文件的 vi.hoisted mocks 对象（含 config 属性）
 * @param redisMocks - 测试文件的 vi.hoisted redisMocks 对象
 */
export function setupJwtAuthTestMocks(
  mocks: { config: JwtAuthConfigMocks },
  redisMocks: Record<string, unknown>,
): void {
  vi.clearAllMocks();
  (redisMocks.useMemoryFallback as () => void | undefined)?.();
  mocks.config.NODE_ENV = 'production';
  mocks.config.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
  mocks.config.ADMIN_API_KEY = '';
  mocks.config.JWT_ALGORITHM = 'HS256';
}
