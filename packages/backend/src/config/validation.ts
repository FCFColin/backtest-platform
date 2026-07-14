/**
 * 配置校验逻辑。
 *
 * 在启动时校验必需配置，生产环境下强制要求密钥/Token/CORS 等安全相关项。
 */

import { config } from './configObject.js';

/** 收集 JWT 相关配置校验错误 */
function validateJwtConfig(): string[] {
  const errors: string[] = [];
  if (config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production') {
    errors.push('JWT_SECRET 在生产环境必须修改默认值，请通过环境变量设置');
  } else if (config.JWT_ALGORITHM === 'HS256' && config.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET 在生产环境（HS256）长度必须 >= 32 字符以保证足够熵');
  }
  if (config.JWT_ALGORITHM === 'RS256') {
    if (!config.JWT_PRIVATE_KEY && !config.JWT_PRIVATE_KEY_FILE) {
      errors.push('RS256 模式下 JWT_PRIVATE_KEY 或 JWT_PRIVATE_KEY_FILE 在生产环境必需');
    }
    if (!config.JWT_PUBLIC_KEY && !config.JWT_PUBLIC_KEY_FILE) {
      errors.push('RS256 模式下 JWT_PUBLIC_KEY 或 JWT_PUBLIC_KEY_FILE 在生产环境必需');
    }
  }
  return errors;
}

/** 收集服务间认证 token 校验错误 */
function validateServiceTokens(): string[] {
  const errors: string[] = [];
  if (!config.ENGINE_AUTH_TOKEN || config.ENGINE_AUTH_TOKEN === 'dev-engine-auth-token') {
    errors.push('ENGINE_AUTH_TOKEN 在生产环境必须设置为非默认的强随机值（>= 32 字符）');
  }
  if (
    !config.DATA_SERVICE_AUTH_TOKEN ||
    config.DATA_SERVICE_AUTH_TOKEN === 'dev-data-service-auth-token'
  ) {
    errors.push('DATA_SERVICE_AUTH_TOKEN 在生产环境必须设置为非默认的强随机值（>= 32 字符）');
  }
  return errors;
}

/** 收集生产环境特有的配置校验错误 */
function collectProductionErrors(): string[] {
  if (config.NODE_ENV !== 'production') return [];
  const errors: string[] = [];

  if (!config.ADMIN_API_KEY) {
    errors.push('ADMIN_API_KEY 在生产环境必需，请通过环境变量设置');
  }

  errors.push(...validateJwtConfig());

  // DATABASE_URL 校验（ADR-007）
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL 在生产环境必须通过环境变量设置，禁止使用默认值');
  }

  errors.push(...validateServiceTokens());

  // 强制认证访问计算端点
  if (!config.REQUIRE_API_KEY) {
    errors.push('REQUIRE_API_KEY 在生产环境必须为 true，否则计算端点可被匿名调用引发 DoS');
  }

  // 禁止 CORS 通配
  if (config.CORS_ORIGINS === true) {
    errors.push('CORS_ORIGINS 在生产环境必须配置来源白名单，禁止使用通配（允许所有来源）');
  }

  // 审计/完整性 HMAC 密钥
  const hmacKey = config.AUDIT_HMAC_KEY;
  if (hmacKey.length < 32) {
    errors.push('AUDIT_HMAC_KEY 在生产环境必需且长度 >= 32（用于审计日志与缓存完整性校验）');
  }

  // 反向代理跳数
  if (process.env.TRUST_PROXY_HOPS === undefined) {
    errors.push(
      'TRUST_PROXY_HOPS 在生产环境必须显式设置（反向代理跳数）；API 可被客户端直连时请设为 0',
    );
  }

  return errors;
}

/**
 * 启动时校验配置。
 *
 * 检查必需环境变量是否已设置。生产环境下 `ADMIN_API_KEY` 必需。
 *
 * @throws {Error} 当必需配置缺失时抛出，错误信息包含全部校验失败项
 */
export function validateConfig(): void {
  const errors: string[] = collectProductionErrors();

  // Security: 非生产环境（development/test）时若使用了 dev 默认密钥，输出警告
  if (config.NODE_ENV !== 'production') {
    const devWarnings: Array<{ condition: boolean; message: string }> = [
      {
        condition: config.ENGINE_AUTH_TOKEN === 'dev-engine-auth-token',
        message: 'ENGINE_AUTH_TOKEN 使用开发默认值，请勿在生产环境使用',
      },
      {
        condition: config.DATA_SERVICE_AUTH_TOKEN === 'dev-data-service-auth-token',
        message: 'DATA_SERVICE_AUTH_TOKEN 使用开发默认值，请勿在生产环境使用',
      },
      {
        condition: config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production',
        message: 'JWT_SECRET 使用开发默认值，请勿在生产环境使用',
      },
      {
        condition: config.CORS_ORIGINS === true,
        message: 'CORS_ORIGINS 允许所有来源，生产环境应配置来源白名单',
      },
    ];
    for (const { condition, message } of devWarnings) {
      if (condition) console.warn(`[config] 安全警告：${message}`);
    }
  }

  if (Number.isNaN(config.TRUST_PROXY_HOPS) || config.TRUST_PROXY_HOPS < 0) {
    errors.push('TRUST_PROXY_HOPS 必须为非负整数');
  }

  // 邮件配置校验（ADR-035）：选择 SMTP 投递时必须提供主机，否则注册/邀请邮件静默丢失。
  if (config.EMAIL_TRANSPORT === 'smtp' && !config.EMAIL_SMTP_HOST) {
    errors.push('EMAIL_TRANSPORT=smtp 时必须设置 EMAIL_SMTP_HOST');
  }

  if (errors.length > 0) {
    throw new Error(`配置校验失败：\n  - ${errors.join('\n  - ')}`);
  }
}
