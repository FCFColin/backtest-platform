/**
 * JWT / OIDC 认证中间件 — 统一入口
 *
 * 企业理由：API Key 是静态凭证，泄露后无法撤销且无法区分用户身份。
 * JWT 提供了有状态的会话管理（过期、刷新、角色嵌入），
 * 是企业级 SaaS 的认证标准。同时保留 x-api-key 兼容模式，
 * 确保现有自动化脚本和内部工具无需立即迁移。
 *
 * 使用 jose 库替代自实现 HMAC-SHA256 的企业理由：
 * 1. alg=none 攻击防护——jose 库强制校验算法声明，拒绝 alg:none 令牌，
 *    自实现需手动检查 header.alg，容易遗漏；
 * 2. OIDC/SSO 支持——jose 支持 JWK Set、x5c 证书链等 OIDC 标准验证方式，
 *    为集成企业 IdP（Okta、Azure AD 等）奠定基础；
 * 3. RS256 非对称密钥——私钥签名、公钥验证，支持密钥轮换和安全分发，
 *    HS256 对称密钥需在所有验证方共享同一密钥，泄露面大。
 *
 * 权衡：
 * - jose 库增加了依赖，但它是 JWT/JWS/JWE 的行业标准实现（JWK、JWKS、
 *   多算法支持），比 jsonwebtoken 更符合 JOSE 规范且零原生依赖。
 * - 保留 HS256 向后兼容路径，迁移期间旧令牌仍可验证。
 * - Refresh Token 存储在 Redis（含内存回退），支持多实例部署和 Token Family 复用检测。
 * - 开发环境跳过认证，方便本地调试，但需确保生产环境不会误配。
 *
 * 注意：此文件现为统一入口，实际实现分布在以下子模块：
 * - jwtSigner.ts — 密钥管理、JWT 签名、Access Token 生成
 * - jwtVerifier.ts — JWT 验证、payload 校验、Express 中间件
 * - refreshToken.ts — Refresh Token 存储、刷新、撤销
 */

// 为向后兼容重新导出类型
export type {
  AuthenticatedRequest,
  TenantedRequest,
  JwtPayload,
  TenantContext,
  OrgRole,
} from './authTypes.js';

// 重新导出子模块
export { generateToken } from './jwtSigner.js';
export { verifyToken, jwtAuth, optionalJwtAuth, assignGuestReadonly } from './jwtVerifier.js';
export {
  generateRefreshToken,
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllUserSessions,
} from './refreshToken.js';
