interface SecretCheck {
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
