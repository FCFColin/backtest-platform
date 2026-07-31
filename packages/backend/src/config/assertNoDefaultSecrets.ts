/**
 * 默认密钥启动拦截（P0-02）
 *
 * 生产环境（NODE_ENV=production）下检查所有安全敏感字段是否使用了默认值。
 * 默认值意味着密钥未通过环境变量注入，存在严重安全风险（任何人可读源码即知密钥）。
 * 检测到默认值时：logger.fatal + process.exit(1)，阻止启动。
 *
 * 检查在模块顶层（import 时即触发），不依赖任何异步初始化，确保 fail-fast。
 */

interface SecretCheck {
  /** 配置项名称（与 config 对象的 key 一致） */
  name: string;
  defaultValue: string;
}

const SECRET_CHECKS: readonly SecretCheck[] = [
  {
    name: 'JWT_SECRET',
    defaultValue: 'dev-only-jwt-secret-change-in-production',
  },
  {
    name: 'ENGINE_AUTH_TOKEN',
    defaultValue: 'dev-engine-auth-token',
  },
  {
    name: 'DATA_SERVICE_AUTH_TOKEN',
    defaultValue: 'dev-data-service-auth-token',
  },
] as const;

/**
 * 仅在 NODE_ENV=production 时检查。开发环境使用默认值是正常的（快速启动）。
 * 检测到默认值时打印违规字段名并终止进程（exit code 1）。
 */
export function assertNoDefaultSecrets(config: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== 'production') return;

  const violations: string[] = [];
  for (const check of SECRET_CHECKS) {
    const actualValue = config[check.name];
    if (typeof actualValue === 'string' && actualValue === check.defaultValue) {
      violations.push(check.name);
    }
  }

  if (violations.length > 0) {
    // eslint-disable-next-line no-console -- fatal 启动错误，须同步写入 stderr 后立即 exit(1)
    console.error(
      `[FATAL] Production environment cannot start with default secret values: ` +
        `${violations.join(', ')}. ` +
        `Set these via environment variables before starting the application.`,
    );
    process.exit(1);
  }
}