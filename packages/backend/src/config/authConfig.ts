/**
 * 认证与 JWT 配置片段。
 *
 * 涵盖管理 API 密钥、强制认证开关、开发跳过认证、JWT 签名密钥/算法/TTL 及 RSA 密钥对。
 */

import { resolveJwtAlgorithm } from './env.js';

/**
 * 认证与 JWT 配置片段。
 */
export const authConfig = {
  /**
   * 管理后台 API 密钥。
   *
   * 生产环境（`NODE_ENV=production`）下必需，否则 `validateConfig()` 将抛出错误。
   * 开发环境可留空。
   * @default ""
   */
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || '',

  /**
   * 是否强制要求认证。
   *
   * 企业理由：计算密集型端点需要认证保护，防止未授权调用消耗计算资源。
   * 设为 true 时，计算端点使用 jwtAuth 强制认证（JWT 或 x-api-key），
   * 并叠加 requirePermission 权限检查（secure by default）。
   * @default false
   */
  REQUIRE_API_KEY: process.env.REQUIRE_API_KEY === 'true',

  /**
   * 开发环境显式跳过 JWT 认证（ADR-026 / T-32）。
   * 仅当 NODE_ENV=development 且为 true 时，jwtAuth 注入 readonly 占位用户。
   * 生产环境忽略此开关。
   */
  DEV_SKIP_AUTH: process.env.DEV_SKIP_AUTH === 'true',

  /**
   * JWT 签名密钥（T-P1-8）。
   *
   * 企业理由：JWT 提供有状态会话管理（过期、刷新、角色嵌入），
   * 是企业级 SaaS 的认证标准。密钥必须通过环境变量注入，禁止硬编码。
   * 开发环境使用固定默认值方便本地联调，生产环境必须覆盖。
   * @default "dev-only-jwt-secret-change-in-production"
   */
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-jwt-secret-change-in-production',

  /**
   * JWT Access Token 有效期（秒）。
   * @default 900（15 分钟）
   */
  JWT_ACCESS_TTL: parseInt(process.env.JWT_ACCESS_TTL || '900', 10),

  /**
   * JWT Refresh Token 有效期（秒）。
   * @default 604800（7 天）
   */
  JWT_REFRESH_TTL: parseInt(process.env.JWT_REFRESH_TTL || '604800', 10),

  /**
   * JWT 签名算法。
   *
   * 企业理由：RS256 使用非对称密钥（私钥签名、公钥验证），支持：
   * 1. alg=none 攻击防护——jose 库强制校验算法声明，拒绝 alg:none 令牌；
   * 2. OIDC/SSO 集成——IdP 公钥验证需要 RS256 或 ES256；
   * 3. 密钥轮换——公钥可独立分发，私钥泄露后只需轮换私钥，无需更新所有验证方。
   *
   * 开发环境默认 HS256（向后兼容），生产环境默认 RS256。
   * @default 'RS256'（生产）/ 'HS256'（开发）
   */
  JWT_ALGORITHM: resolveJwtAlgorithm(),

  /**
   * RSA 私钥（PEM 格式）。
   *
   * 企业理由：RS256 签名需要私钥。生产环境必须通过环境变量或文件注入，
   * 禁止硬编码。支持两种配置方式：
   * 1. 直接设置 JWT_PRIVATE_KEY 环境变量（PEM 内容）
   * 2. 设置 JWT_PRIVATE_KEY_FILE 环境变量指向 PEM 文件路径
   * 开发环境未配置时自动生成临时密钥对（仅用于本地调试）。
   * @default ""（开发环境自动生成）
   */
  JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY || '',

  /**
   * RSA 私钥文件路径（PEM 格式）。
   *
   * 当 JWT_PRIVATE_KEY 未直接设置时，可指定 PEM 文件路径。
   * @default ""
   */
  JWT_PRIVATE_KEY_FILE: process.env.JWT_PRIVATE_KEY_FILE || '',

  /**
   * RSA 公钥（PEM 格式）。
   *
   * 企业理由：RS256 验证需要公钥。公钥可安全分发，验证方无需持有私钥。
   * 支持两种配置方式：
   * 1. 直接设置 JWT_PUBLIC_KEY 环境变量（PEM 内容）
   * 2. 设置 JWT_PUBLIC_KEY_FILE 环境变量指向 PEM 文件路径
   * 开发环境未配置时自动生成临时密钥对（仅用于本地调试）。
   * @default ""（开发环境自动生成）
   */
  JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY || '',

  /**
   * RSA 公钥文件路径（PEM 格式）。
   *
   * 当 JWT_PUBLIC_KEY 未直接设置时，可指定 PEM 文件路径。
   * @default ""
   */
  JWT_PUBLIC_KEY_FILE: process.env.JWT_PUBLIC_KEY_FILE || '',
};
