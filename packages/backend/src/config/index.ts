import { config } from './env.js';

export { config, authConfig } from './env.js';

export {
  type PlanLimits,
  USAGE_METRIC,
  PLAN_LIMITS,
  type FlagContext,
  isEnabled,
  logFlagAccess,
  PLAN_LIMIT_FLAGS,
} from './limits.js';

import { logger } from '../utils/logger.js';

function validateJwtConfig(): string[] {
  const errors: string[] = [];
  if (config.JWT_SECRET === 'dev-only-jwt-secret-change-in-production') {
    errors.push('JWT_SECRET 在生产环境必须修改默认值，请通过环境变量设置');
  } else if (config.JWT_ALGORITHM === 'HS256' && config.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET 在生产环境（HS256）长度必须 >= 32 字符以保证足够熵');
  }
  if (config.JWT_ALGORITHM === 'RS256') {
    if (!config.JWT_PRIVATE_KEY && !config.JWT_PRIVATE_KEY_FILE)
      errors.push('RS256 模式下 JWT_PRIVATE_KEY 或 JWT_PRIVATE_KEY_FILE 在生产环境必需');
    if (!config.JWT_PUBLIC_KEY && !config.JWT_PUBLIC_KEY_FILE)
      errors.push('RS256 模式下 JWT_PUBLIC_KEY 或 JWT_PUBLIC_KEY_FILE 在生产环境必需');
  }
  return errors;
}

function validateServiceTokens(): string[] {
  const errors: string[] = [];
  if (!config.ENGINE_AUTH_TOKEN || config.ENGINE_AUTH_TOKEN === 'dev-engine-auth-token')
    errors.push('ENGINE_AUTH_TOKEN 在生产环境必须设置为非默认的强随机值（>= 32 字符）');
  if (
    !config.DATA_SERVICE_AUTH_TOKEN ||
    config.DATA_SERVICE_AUTH_TOKEN === 'dev-data-service-auth-token'
  )
    errors.push('DATA_SERVICE_AUTH_TOKEN 在生产环境必须设置为非默认的强随机值（>= 32 字符）');
  return errors;
}

function collectProductionErrors(): string[] {
  if (config.NODE_ENV !== 'production') return [];
  const errors: string[] = [...validateJwtConfig()];
  if (!process.env.DATABASE_URL)
    errors.push('DATABASE_URL 在生产环境必须通过环境变量设置，禁止使用默认值');
  errors.push(...validateServiceTokens());
  if (config.DEV_SKIP_AUTH) errors.push('DEV_SKIP_AUTH 在生产环境必须为 false');
  if (config.CORS_ORIGINS === true)
    errors.push('CORS_ORIGINS 在生产环境必须配置来源白名单，禁止使用通配（允许所有来源）');
  if (config.AUDIT_HMAC_KEY.length < 32)
    errors.push('AUDIT_HMAC_KEY 在生产环境必需且长度 >= 32（用于审计日志与缓存完整性校验）');
  if (process.env.TRUST_PROXY_HOPS === undefined)
    errors.push(
      'TRUST_PROXY_HOPS 在生产环境必须显式设置（反向代理跳数）；API 可被客户端直连时请设为 0',
    );
  return errors;
}

/**
 * @throws {Error} 当必需配置缺失时抛出，错误信息包含全部校验失败项
 */
export function validateConfig(): void {
  const errors: string[] = collectProductionErrors();

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
      if (condition) logger.warn({ message }, '安全警告');
    }
  }

  if (Number.isNaN(config.TRUST_PROXY_HOPS) || config.TRUST_PROXY_HOPS < 0)
    errors.push('TRUST_PROXY_HOPS 必须为非负整数');
  if (config.EMAIL_TRANSPORT === 'smtp' && !config.EMAIL_SMTP_HOST)
    errors.push('EMAIL_TRANSPORT=smtp 时必须设置 EMAIL_SMTP_HOST');

  if (errors.length > 0) throw new Error(`配置校验失败：\n  - ${errors.join('\n  - ')}`);
}
