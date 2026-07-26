/**
 * 认证与 JWT 配置片段。
 *
 * 涵盖强制认证开关、开发跳过认证、JWT 签名密钥/算法/TTL 及 RSA 密钥对。
 *
 * 注意（P0-04）：`ADMIN_API_KEY` 已从运行时配置中移除——平台 break-glass 密钥改为
 * 入库管理（api_keys 表，is_platform_admin=TRUE）。环境变量 `ADMIN_API_KEY` 仅在首次启动
 * bootstrap 时由 `infrastructure/platformAdminBootstrap.ts` 直接读取（process.env），
 * 迁移到 DB 后即不再被运行时鉴权路径引用。
 */

import { resolveJwtAlgorithm } from './env.js';

/** 认证与 JWT 配置片段。 */
export const authConfig = {
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

  // ---------------------------------------------------------------------------
  // 等保三级合规配置（P1-09，GB/T 22239 三级 8.1.4 / 8.1.10）
  // ---------------------------------------------------------------------------

  /** 密码最小长度。@default 12（等保三级要求 ≥8，取 12 更严格） */
  PASSWORD_MIN_LENGTH: parseInt(process.env.PASSWORD_MIN_LENGTH || '12', 10),

  /** 密码复杂度：要求至少 N 类字符（大写/小写/数字/特殊，共 4 类）。@default 3 */
  PASSWORD_REQUIRE_COMPLEXITY: parseInt(process.env.PASSWORD_REQUIRE_COMPLEXITY || '3', 10),

  /** 密码历史保留数（禁止复用最近 N 次密码）。@default 5 */
  PASSWORD_HISTORY_KEEP: parseInt(process.env.PASSWORD_HISTORY_KEEP || '5', 10),

  /** 密码过期天数（0=不过期）。@default 90 */
  PASSWORD_EXPIRE_DAYS: parseInt(process.env.PASSWORD_EXPIRE_DAYS || '90', 10),

  /** MFA 发行方名称（TOTP issuer，显示在 authenticator app）。@default 'BacktestPlatform' */
  MFA_ISSUER: process.env.MFA_ISSUER || 'BacktestPlatform',

  /** MFA 备份码数量。@default 8 */
  MFA_BACKUP_CODE_COUNT: parseInt(process.env.MFA_BACKUP_CODE_COUNT || '8', 10),

  /** 是否强制 ADMIN 角色启用 MFA。@default true */
  MFA_REQUIRED_FOR_ADMIN: process.env.MFA_REQUIRED_FOR_ADMIN !== 'false',

  /** 异常登录检测：时间窗口（秒）。@default 300（5 分钟） */
  ANOMALY_LOGIN_WINDOW_SEC: parseInt(process.env.ANOMALY_LOGIN_WINDOW_SEC || '300', 10),

  /** 异常登录检测：窗口内最大失败次数。@default 10 */
  ANOMALY_LOGIN_MAX_FAILURES: parseInt(process.env.ANOMALY_LOGIN_MAX_FAILURES || '10', 10),

  /** 异常登录锁定时长（秒）。@default 3600（1 小时） */
  ANOMALY_LOGIN_LOCKOUT_SEC: parseInt(process.env.ANOMALY_LOGIN_LOCKOUT_SEC || '3600', 10),

  /** 审计日志保留天数（等保三级 ≥180 天）。@default 180 */
  AUDIT_RETENTION_DAYS: parseInt(process.env.AUDIT_RETENTION_DAYS || '180', 10),

  /** readonly 角色会话 idle timeout（秒）。@default 1800（30 分钟） */
  SESSION_IDLE_TIMEOUT_READONLY_SEC: parseInt(
    process.env.SESSION_IDLE_TIMEOUT_READONLY_SEC || '1800',
    10,
  ),

  /** analyst 角色会话 idle timeout（秒）。@default 3600（60 分钟） */
  SESSION_IDLE_TIMEOUT_ANALYST_SEC: parseInt(
    process.env.SESSION_IDLE_TIMEOUT_ANALYST_SEC || '3600',
    10,
  ),

  // ---------------------------------------------------------------------------
  // 可配置 RBAC 缓存配置（P2-01）
  // ---------------------------------------------------------------------------

  /** 用户权限 Redis 缓存 TTL（秒）。@default 300（5 分钟） */
  RBAC_CACHE_TTL_SEC: parseInt(process.env.RBAC_CACHE_TTL_SEC || '300', 10),
};
