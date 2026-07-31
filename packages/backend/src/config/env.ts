/**
 * 环境变量解析与配置片段合成（ADR-007 / ADR-008 / ADR-031 / ADR-035 / ADR-036）。
 * 5 个命名空间片段（server/engine/auth/database/integrations）通过 Object.assign
 * 合成为扁平 config 公共 API。assertNoDefaultSecrets 从 limits.ts 导入。
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertNoDefaultSecrets } from './assertNoDefaultSecrets.js';

// 从本文件位置上溯至 package.json 所在目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

// 必须在 config 对象构造前加载，使环境变量在解析时可用
dotenv.config({ path: path.resolve(PROJECT_ROOT, '.env') });

export type NodeEnv = 'development' | 'production' | 'test' | 'staging';

/** true=允许所有来源，string[]=白名单 */
type CorsOrigins = true | string[];

export function resolveJwtAlgorithm(): 'RS256' | 'HS256' {
  return (process.env.JWT_ALGORITHM ||
    ((process.env.NODE_ENV || 'development') === 'production' ? 'RS256' : 'HS256')) as
    'RS256' | 'HS256';
}

export function parseCorsOrigins(raw: string | undefined): CorsOrigins {
  if (!raw || raw.trim() === '' || raw.trim() === '*') {
    return true;
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 缺失时 fail-fast 抛出错误（H-006）。 */
export function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Set it in .env (see .env.example).`);
  }
  return value;
}

export const serverConfig = {
  NODE_ENV: (process.env.NODE_ENV || 'development') as NodeEnv,
  SERVE_STATIC: process.env.SERVE_STATIC !== undefined ? process.env.SERVE_STATIC === 'true' : true,
  API_PORT: parseInt(process.env.API_PORT || process.env.PORT || '15001', 10),
  CORS_ORIGINS: parseCorsOrigins(process.env.CORS_ORIGINS),
  TRUST_PROXY_HOPS: Number.parseInt(process.env.TRUST_PROXY_HOPS ?? '1', 10),
  COMPUTE_RATE_LIMIT_MAX: parseInt(process.env.COMPUTE_RATE_LIMIT_MAX || '10', 10),
  SYNC_COMPUTE_TIMEOUT_MS: parseInt(process.env.SYNC_COMPUTE_TIMEOUT_MS || '30000', 10),
  WORKER_CONCURRENCY: parseInt(process.env.WORKER_CONCURRENCY || '3', 10),
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:15173',
  PROJECT_ROOT,
  MIGRATIONS_DIR: path.resolve(PROJECT_ROOT, 'migrations'),
  FRONTEND_DIST_DIR: path.resolve(PROJECT_ROOT, 'dist'),
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '',
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || '',
};

export const engineConfig = {
  GO_ENGINE_URL: process.env.GO_ENGINE_URL || 'http://127.0.0.1:15004',
  ENGINE_TIMEOUT_MS: parseInt(process.env.ENGINE_TIMEOUT_MS || '120000', 10),
  GO_DATA_SERVICE_URL: process.env.GO_DATA_SERVICE_URL || 'http://127.0.0.1:15003',
  GO_DATA_SERVICE_TIMEOUT_MS: parseInt(process.env.GO_DATA_SERVICE_TIMEOUT_MS || '5000', 10),
  ENGINE_AUTH_TOKEN: requireSecret('ENGINE_AUTH_TOKEN'),
  DATA_SERVICE_AUTH_TOKEN: requireSecret('DATA_SERVICE_AUTH_TOKEN'),
};

export const authConfig = {
  REQUIRE_API_KEY: process.env.REQUIRE_API_KEY === 'true',
  DEV_SKIP_AUTH: process.env.DEV_SKIP_AUTH === 'true',
  JWT_SECRET: requireSecret('JWT_SECRET'),
  JWT_ACCESS_TTL: parseInt(process.env.JWT_ACCESS_TTL || '900', 10),
  JWT_REFRESH_TTL: parseInt(process.env.JWT_REFRESH_TTL || '604800', 10),
  JWT_ALGORITHM: resolveJwtAlgorithm(),
  JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY || '',
  JWT_PRIVATE_KEY_FILE: process.env.JWT_PRIVATE_KEY_FILE || '',
  JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY || '',
  JWT_PUBLIC_KEY_FILE: process.env.JWT_PUBLIC_KEY_FILE || '',
  AUDIT_HMAC_KEY: process.env.AUDIT_HMAC_KEY || '',
  DEBUG_AUTH_TOKEN: process.env.DEBUG_AUTH_TOKEN || '',
  METRICS_AUTH_TOKEN: process.env.METRICS_AUTH_TOKEN || '',
  PASSWORD_MIN_LENGTH: parseInt(process.env.PASSWORD_MIN_LENGTH || '12', 10),
  PASSWORD_REQUIRE_COMPLEXITY: parseInt(process.env.PASSWORD_REQUIRE_COMPLEXITY || '3', 10),
  PASSWORD_HISTORY_KEEP: parseInt(process.env.PASSWORD_HISTORY_KEEP || '5', 10),
  PASSWORD_EXPIRE_DAYS: parseInt(process.env.PASSWORD_EXPIRE_DAYS || '90', 10),
  MFA_ISSUER: process.env.MFA_ISSUER || 'BacktestPlatform',
  MFA_BACKUP_CODE_COUNT: parseInt(process.env.MFA_BACKUP_CODE_COUNT || '8', 10),
  MFA_REQUIRED_FOR_ADMIN: process.env.MFA_REQUIRED_FOR_ADMIN !== 'false',
  ANOMALY_LOGIN_WINDOW_SEC: parseInt(process.env.ANOMALY_LOGIN_WINDOW_SEC || '300', 10),
  ANOMALY_LOGIN_MAX_FAILURES: parseInt(process.env.ANOMALY_LOGIN_MAX_FAILURES || '10', 10),
  ANOMALY_LOGIN_LOCKOUT_SEC: parseInt(process.env.ANOMALY_LOGIN_LOCKOUT_SEC || '3600', 10),
  AUDIT_RETENTION_DAYS: parseInt(process.env.AUDIT_RETENTION_DAYS || '180', 10),
  SESSION_IDLE_TIMEOUT_READONLY_SEC: parseInt(
    process.env.SESSION_IDLE_TIMEOUT_READONLY_SEC || '1800',
    10,
  ),
  SESSION_IDLE_TIMEOUT_ANALYST_SEC: parseInt(
    process.env.SESSION_IDLE_TIMEOUT_ANALYST_SEC || '3600',
    10,
  ),
  RBAC_CACHE_TTL_SEC: parseInt(process.env.RBAC_CACHE_TTL_SEC || '300', 10),
};

export const databaseConfig = {
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql://backtest:backtest@localhost:5432/backtest',
  DATABASE_READ_URL: process.env.DATABASE_READ_URL || '',
  DB_STATEMENT_TIMEOUT_MS: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '10000', 10),
  BACKTEST_SYNC_TIMEOUT_MS: parseInt(process.env.BACKTEST_SYNC_TIMEOUT_MS || '120000', 10),
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  REDIS_SENTINELS: process.env.REDIS_SENTINELS || '',
  REDIS_SENTINEL_NAME: process.env.REDIS_SENTINEL_NAME || 'mymaster',
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '20', 10),
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),
};

export const integrationsConfig = {
  EMAIL_TRANSPORT: (process.env.EMAIL_TRANSPORT || 'console') as 'smtp' | 'console',
  EMAIL_FROM: process.env.EMAIL_FROM || 'Backtest Platform <no-reply@backtest.local>',
  EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST || '',
  EMAIL_SMTP_PORT: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
  EMAIL_SMTP_SECURE: process.env.EMAIL_SMTP_SECURE === 'true',
  EMAIL_SMTP_USER: process.env.EMAIL_SMTP_USER || '',
  EMAIL_SMTP_PASS: process.env.EMAIL_SMTP_PASS || '',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
  STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO || '',
  STRIPE_PRICE_ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE || '',
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT || '',
  MINIO_PORT: parseInt(process.env.MINIO_PORT || '9000', 10),
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY || '',
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY || '',
  MINIO_USE_SSL: process.env.MINIO_USE_SSL === 'true',
  CDC_KAFKA_ENABLED: process.env.CDC_KAFKA_ENABLED === 'true',
  KAFKA_BROKERS: process.env.KAFKA_BROKERS || 'localhost:9092',
  KAFKA_TOPICS: process.env.KAFKA_TOPICS || 'backtest.Run,backtest.BacktestSession,backtest.audit',
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'backtest-outbox-consumer',
};

type Config = typeof serverConfig &
  typeof engineConfig &
  typeof authConfig &
  typeof databaseConfig &
  typeof integrationsConfig;

/**
 * 由各命名空间片段通过 `Object.assign` 合成，保持 `config.API_PORT` 等扁平访问路径。
 * 被 29+ 处消费方使用，不可删除。新代码同样应使用 `config.<KEY>` 路径以保持一致。
 */
export const config: Config = Object.assign(
  {},
  serverConfig,
  engineConfig,
  authConfig,
  databaseConfig,
  integrationsConfig,
);

// P0-02：生产环境默认密钥启动拦截——在模块加载时即触发（fail-fast），
// 不等待 validateConfig 延迟调用。生产环境使用默认密钥是安全红线。
assertNoDefaultSecrets(config as Record<string, unknown>);
