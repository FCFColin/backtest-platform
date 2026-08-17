// 默认密钥单一事实源：assertNoDefaultSecrets（fail-closed 启动拦截）与
// config/index.ts 的校验/告警共用，避免双清单漂移
export const DEFAULT_SECRETS: Readonly<Record<string, string>> = {
  JWT_SECRET: 'dev-only-jwt-secret-change-in-production',
  ENGINE_AUTH_TOKEN: 'dev-engine-auth-token',
  DATA_SERVICE_AUTH_TOKEN: 'dev-data-service-auth-token',
} as const;

export function assertNoDefaultSecrets(config: Record<string, unknown>): void {
  // M1 fail-closed：仅显式 development/test 跳过；未设置 NODE_ENV 按生产检查默认密钥
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') return;

  const violations = Object.entries(DEFAULT_SECRETS)
    .filter(([name, defaultValue]) => config[name] === defaultValue)
    .map(([name]) => name);

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
