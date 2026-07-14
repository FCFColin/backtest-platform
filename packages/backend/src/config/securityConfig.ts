/**
 * 安全配置片段。
 *
 * 收敛此前散落在 integrity / auditLog / debugRoutes / healthRoutes 等模块中
 * 直接读取 process.env 的安全相关密钥与令牌，统一通过 config 对象访问，
 * 便于审计、默认值管理与生产环境校验。
 */

/**
 * 安全配置片段（审计 HMAC / 调试端点令牌 / 运维端点令牌）。
 */
export const securityConfig = {
  /**
   * 审计日志与缓存完整性校验使用的 HMAC-SHA256 密钥。
   *
   * 企业理由：审计日志是合规基础（SOX/GDPR/SOC 2），HMAC 签名防止篡改；
   * 缓存文件签名防止离线篡改污染回测结果（OWASP A08）。
   * 生产环境必须通过环境变量注入强随机值（>= 32 字符）。
   * @default ""（未配置，签名/校验静默跳过）
   */
  AUDIT_HMAC_KEY: process.env.AUDIT_HMAC_KEY || '',

  /**
   * 调试端点 Bearer 令牌（T-29）。
   *
   * 企业理由：生产排障需 CPU/堆快照等调试端点，但必须鉴权以防信息泄露。
   * 未配置时 /api/v1/debug/* 返回 404（端点禁用）。
   * @default ""（未配置，调试端点禁用）
   */
  DEBUG_AUTH_TOKEN: process.env.DEBUG_AUTH_TOKEN || '',

  /**
   * 运维端点 Bearer 令牌（/ready / /metrics）。
   *
   * 企业理由：/ready 暴露引擎/DB/Redis 拓扑，/metrics 暴露业务指标，
   * 均不可匿名访问。未配置时允许匿名访问（开发/内网场景）。
   * @default ""（未配置，运维端点免鉴权）
   */
  METRICS_AUTH_TOKEN: process.env.METRICS_AUTH_TOKEN || '',
};
