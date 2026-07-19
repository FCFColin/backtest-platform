/**
 * 测试辅助：JWT 签发工具
 *
 * 仅保留 base64urlEncode + signTestToken + DEFAULT_JWT_SECRET + UserRole。
 * Phase 5.2 已清理 9 个未用导出（createUserFixture/mockAdmin/mockUser/mockReadonly/
 * mockAnalyst/createJwtPayload/signMockJwt/verifyMockJwt/createJwtAuthMiddlewareMock）。
 *
 * 用法：
 *   import { base64urlEncode, signTestToken } from '../helpers/jwtFixtures.js';
 *   const token = await signTestToken({ sub: 'user-1', role: 'admin' });
 */

import { SignJWT, importJWK } from 'jose';

/** 用户角色枚举（与 User.role 一致） */
export type UserRole = 'admin' | 'analyst' | 'readonly';

/** 默认 JWT 密钥（与 jwt-auth 测试 config 默认值一致） */
const DEFAULT_JWT_SECRET = 'test-jwt-secret-for-unit-tests';

/**
 * Base64URL 编码（无填充）
 *
 * 用于构造 JWK oct 密钥时的 k 字段编码。
 *
 * @param input - UTF-8 字符串
 * @returns Base64URL 编码字符串（无 = 填充）
 */
export function base64urlEncode(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** signTestToken 选项 */
export interface SignTestTokenOptions {
  /** 不设置 exp（用于"缺少 exp"用例） */
  omitExp?: boolean;
  /** 自定义密钥（默认使用 DEFAULT_JWT_SECRET） */
  secret?: string;
}

/**
 * 使用 HS256 签发测试 token
 *
 * 集中维护"构造密钥 + 签发"模板，消除 5+ 处重复样板。
 * 默认使用 DEFAULT_JWT_SECRET，与 jwt-auth 测试 config 默认值一致。
 *
 * @param payload - JWT payload（不含 iat/exp，由本函数注入）
 * @param options - 可选配置：omitExp=true 时不设置 exp；secret 自定义密钥
 * @returns 签发后的 JWT 字符串
 */
export async function signTestToken(
  payload: Record<string, unknown>,
  options: SignTestTokenOptions = {},
): Promise<string> {
  const secret = options.secret ?? DEFAULT_JWT_SECRET;
  const key = await importJWK({ kty: 'oct', k: base64urlEncode(secret) }, 'HS256');
  const builder = new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();
  if (!options.omitExp) builder.setExpirationTime('1h');
  return builder.sign(key);
}
