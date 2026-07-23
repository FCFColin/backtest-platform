/**
 * 认证与 JWT 配置片段。
 *
 * 涵盖管理 API 密钥、强制认证开关、开发跳过认证、JWT 签名密钥/算法/TTL 及 RSA 密钥对。
 */

import { resolveJwtAlgorithm } from './env.js';

/** 认证与 JWT 配置片段。 */
export const authConfig = {
  /** 管理后台 API 密钥。生产环境必需，开发可留空。@default "" */
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || '',

  /** 是否强制要求计算端点认证（JWT 或 x-api-key + 权限检查）。@default false */
  REQUIRE_API_KEY: process.env.REQUIRE_API_KEY === 'true',

  /** 开发环境跳过 JWT 认证（ADR-026 / T-32），仅 NODE_ENV=development 生效。 */
  DEV_SKIP_AUTH: process.env.DEV_SKIP_AUTH === 'true',

  /** JWT 签名密钥（T-P1-8），生产环境必须通过环境变量注入。@default "dev-only-jwt-secret-change-in-production" */
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-jwt-secret-change-in-production',

  /** JWT Access Token 有效期（秒）。@default 900（15 分钟） */
  JWT_ACCESS_TTL: parseInt(process.env.JWT_ACCESS_TTL || '900', 10),

  /** JWT Refresh Token 有效期（秒）。@default 604800（7 天） */
  JWT_REFRESH_TTL: parseInt(process.env.JWT_REFRESH_TTL || '604800', 10),

  /** JWT 签名算法，开发默认 HS256，生产默认 RS256。@default 'RS256'（生产）/ 'HS256'（开发） */
  JWT_ALGORITHM: resolveJwtAlgorithm(),

  /** RSA 私钥（PEM 格式），支持 JWT_PRIVATE_KEY 或 JWT_PRIVATE_KEY_FILE 注入。@default ""（开发环境自动生成） */
  JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY || '',

  /** RSA 私钥文件路径（PEM 格式）。@default "" */
  JWT_PRIVATE_KEY_FILE: process.env.JWT_PRIVATE_KEY_FILE || '',

  /** RSA 公钥（PEM 格式），支持 JWT_PUBLIC_KEY 或 JWT_PUBLIC_KEY_FILE 注入。@default ""（开发环境自动生成） */
  JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY || '',

  /** RSA 公钥文件路径（PEM 格式）。@default "" */
  JWT_PUBLIC_KEY_FILE: process.env.JWT_PUBLIC_KEY_FILE || '',

  // ---------------------------------------------------------------------------
  // 安全配置（从 securityConfig.ts 合并）
  // ---------------------------------------------------------------------------

  /** 审计日志与缓存完整性校验使用的 HMAC-SHA256 密钥。 */
  AUDIT_HMAC_KEY: process.env.AUDIT_HMAC_KEY || '',

  /** 调试端点 Bearer 令牌。未配置时 /api/v1/debug/* 返回 404。 */
  DEBUG_AUTH_TOKEN: process.env.DEBUG_AUTH_TOKEN || '',

  /** 运维端点 Bearer 令牌（/ready / /metrics）。未配置时免鉴权。 */
  METRICS_AUTH_TOKEN: process.env.METRICS_AUTH_TOKEN || '',
};
