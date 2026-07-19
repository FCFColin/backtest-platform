/**
 * 测试辅助：user service / userRepo fixtures
 *
 * 仅保留 mockUserRecord + mockUserRecordWithPassword。
 * Phase 5.3 已清理 6 个未用导出（mockUserRepo/createArgon2Mock/createPoolMock/
 * createCryptoMock/createUserEntity/createDisabledUser）。
 *
 * 用法：
 *   import { mockUserRecord, mockUserRecordWithPassword } from '../helpers/userFixtures.js';
 *   const row = mockUserRecordWithPassword({ role: 'admin' });
 */

/**
 * 创建 DB 用户行 fixture（snake_case 字段，模拟 pg 返回的原始 row）
 *
 * @param overrides - 覆盖默认字段
 * @returns 包含 id/username/role/created_at/is_active 等字段的 DB 行
 */
export function mockUserRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'user-123',
    username: 'testuser',
    role: 'analyst',
    created_at: new Date('2020-01-02'),
    is_active: true,
    ...overrides,
  };
}

/**
 * 创建带 password_hash 的 DB 用户行（用于 verifyUser 测试）
 *
 * @param overrides - 覆盖默认字段
 * @returns 包含 password_hash 字段的 DB 行
 */
export function mockUserRecordWithPassword(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return mockUserRecord({
    password_hash: 'hashed-password',
    ...overrides,
  });
}
