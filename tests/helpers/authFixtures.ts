/**
 * 测试辅助：auth routes fixtures
 *
 * 仅保留 3 个 payload 常量（validLoginPayload / validPasswordLoginPayload / validRefreshPayload）。
 * Phase 5.4 已清理 7 个未用导出（validSignupPayload/mockAuthRequest/mockAuthResponse/
 * createJwtAuthMocks/createUserServiceMocks/createLoginLockoutMocks/createMembershipServiceMocks）。
 *
 * 用法：
 *   import { validLoginPayload } from '../helpers/authFixtures.js';
 *   fetch('/api/v1/auth/login', { body: JSON.stringify(validLoginPayload) });
 */

/** 有效登录请求体（API Key 模式） */
export const validLoginPayload = {
  apiKey: 'test-secret-key-123',
};

/** 有效密码登录请求体 */
export const validPasswordLoginPayload = {
  username: 'testuser',
  password: 'correct-pass',
};

/** 有效 refresh 请求体 */
export const validRefreshPayload = {
  refreshToken: 'valid-refresh-token',
};
