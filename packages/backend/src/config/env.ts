import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertNoDefaultSecrets } from './assertNoDefaultSecrets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

dotenv.config({ path: path.resolve(PROJECT_ROOT, '.env') });

type NodeEnv = 'development' | 'production' | 'test' | 'staging';
type CorsOrigins = true | string[];

const asInt = (raw: string, label: string): number => {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid integer for ${label}: "${raw}"`);
  return parsed;
};
const intFromEnv = (name: string, fallback: number): number =>
  asInt(process.env[name] ?? String(fallback), name);
const int = (v: string | undefined, d: string): number => asInt(v || d, 'config');
const bool = (v: string | undefined) => v === 'true';
const str = (v: string | undefined, d: string) => v || d;
const NODE_ENV_VALUES: readonly NodeEnv[] = ['development', 'production', 'test', 'staging'];
const nodeEnv = (v: string | undefined, d: NodeEnv): NodeEnv => {
  const value = v || d;
  if (!NODE_ENV_VALUES.includes(value as NodeEnv)) {
    throw new Error(`NODE_ENV must be one of ${NODE_ENV_VALUES.join(', ')}`);
  }
  return value as NodeEnv;
};

export function resolveJwtAlgorithm(): 'RS256' | 'HS256' {
  return (process.env.JWT_ALGORITHM ||
    (process.env.NODE_ENV === 'production' ? 'RS256' : 'HS256')) as 'RS256' | 'HS256';
}

export function parseCorsOrigins(raw: string | undefined): CorsOrigins {
  if (!raw || raw.trim() === '' || raw.trim() === '*') return true;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Set it in .env (see .env.example).`);
  return value;
}

const serverConfig = {
  NODE_ENV: nodeEnv(process.env.NODE_ENV, 'development'),
  SERVE_STATIC: process.env.SERVE_STATIC !== undefined ? bool(process.env.SERVE_STATIC) : true,
  API_PORT: int(process.env.API_PORT || process.env.PORT, '15001'),
  CORS_ORIGINS: parseCorsOrigins(process.env.CORS_ORIGINS),
  TRUST_PROXY_HOPS: intFromEnv('TRUST_PROXY_HOPS', 1),
  COMPUTE_RATE_LIMIT_MAX: intFromEnv('COMPUTE_RATE_LIMIT_MAX', 10),
  DISABLE_RATE_LIMIT: bool(process.env.DISABLE_RATE_LIMIT),
  SYNC_COMPUTE_TIMEOUT_MS: intFromEnv('SYNC_COMPUTE_TIMEOUT_MS', 30000),
  WORKER_CONCURRENCY: intFromEnv('WORKER_CONCURRENCY', 3),
  MAX_RESPONSE_BODY_SIZE: intFromEnv('MAX_RESPONSE_BODY_SIZE', 50 * 1024 * 1024),
  OUTBOX_RETENTION_DAYS: intFromEnv('OUTBOX_RETENTION_DAYS', 7),
  APP_BASE_URL: str(process.env.APP_BASE_URL, 'http://localhost:15173'),
  PROJECT_ROOT,
  MIGRATIONS_DIR: path.resolve(PROJECT_ROOT, 'migrations'),
  FRONTEND_DIST_DIR: path.resolve(PROJECT_ROOT, 'dist'),
  OTEL_EXPORTER_OTLP_ENDPOINT: str(process.env.OTEL_EXPORTER_OTLP_ENDPOINT, ''),
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: str(process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT, ''),
};

const engineConfig = {
  GO_ENGINE_URL: str(process.env.GO_ENGINE_URL, 'http://127.0.0.1:15004'),
  ENGINE_TIMEOUT_MS: intFromEnv('ENGINE_TIMEOUT_MS', 120000),
  GO_DATA_SERVICE_URL: str(process.env.GO_DATA_SERVICE_URL, 'http://127.0.0.1:15003'),
  GO_DATA_SERVICE_TIMEOUT_MS: intFromEnv('GO_DATA_SERVICE_TIMEOUT_MS', 5000),
  ENGINE_AUTH_TOKEN: requireSecret('ENGINE_AUTH_TOKEN'),
  DATA_SERVICE_AUTH_TOKEN: requireSecret('DATA_SERVICE_AUTH_TOKEN'),
};

export const authConfig = {
  DEV_SKIP_AUTH: bool(process.env.DEV_SKIP_AUTH),
  JWT_SECRET: requireSecret('JWT_SECRET'),
  JWT_ACCESS_TTL: intFromEnv('JWT_ACCESS_TTL', 900),
  JWT_REFRESH_TTL: intFromEnv('JWT_REFRESH_TTL', 604800),
  JWT_ALGORITHM: resolveJwtAlgorithm(),
  JWT_PRIVATE_KEY: str(process.env.JWT_PRIVATE_KEY, ''),
  JWT_PRIVATE_KEY_FILE: str(process.env.JWT_PRIVATE_KEY_FILE, ''),
  JWT_PUBLIC_KEY: str(process.env.JWT_PUBLIC_KEY, ''),
  JWT_PUBLIC_KEY_FILE: str(process.env.JWT_PUBLIC_KEY_FILE, ''),
  AUDIT_HMAC_KEY: str(process.env.AUDIT_HMAC_KEY, ''),
  DEBUG_AUTH_TOKEN: str(process.env.DEBUG_AUTH_TOKEN, ''),
  METRICS_AUTH_TOKEN: str(process.env.METRICS_AUTH_TOKEN, ''),
  ANOMALY_LOGIN_WINDOW_SEC: intFromEnv('ANOMALY_LOGIN_WINDOW_SEC', 300),
  ANOMALY_LOGIN_MAX_FAILURES: intFromEnv('ANOMALY_LOGIN_MAX_FAILURES', 10),
  ANOMALY_LOGIN_LOCKOUT_SEC: intFromEnv('ANOMALY_LOGIN_LOCKOUT_SEC', 3600),
  AUDIT_RETENTION_DAYS: intFromEnv('AUDIT_RETENTION_DAYS', 180),
  SESSION_IDLE_TIMEOUT_READONLY_SEC: intFromEnv('SESSION_IDLE_TIMEOUT_READONLY_SEC', 1800),
  SESSION_IDLE_TIMEOUT_ANALYST_SEC: intFromEnv('SESSION_IDLE_TIMEOUT_ANALYST_SEC', 3600),
};

const databaseConfig = {
  DATABASE_URL: str(
    process.env.DATABASE_URL,
    'postgresql://backtest_app:backtest_app_dev@localhost:5432/backtest',
  ),
  DATABASE_READ_URL: str(process.env.DATABASE_READ_URL, ''),
  DB_STATEMENT_TIMEOUT_MS: intFromEnv('DB_STATEMENT_TIMEOUT_MS', 10000),
  BACKTEST_SYNC_TIMEOUT_MS: intFromEnv('BACKTEST_SYNC_TIMEOUT_MS', 120000),
  REDIS_URL: str(process.env.REDIS_URL, 'redis://localhost:6379'),
  REDIS_SENTINELS: str(process.env.REDIS_SENTINELS, ''),
  REDIS_SENTINEL_NAME: str(process.env.REDIS_SENTINEL_NAME, 'mymaster'),
  REDIS_PASSWORD: str(process.env.REDIS_PASSWORD, ''),
  DB_POOL_MAX: intFromEnv('DB_POOL_MAX', 20),
  DB_POOL_MIN: intFromEnv('DB_POOL_MIN', 2),
};

const integrationsConfig = {
  EMAIL_TRANSPORT: str(process.env.EMAIL_TRANSPORT, 'console') as 'smtp' | 'console',
  EMAIL_FROM: str(process.env.EMAIL_FROM, 'Backtest Platform <no-reply@backtest.local>'),
  EMAIL_SMTP_HOST: str(process.env.EMAIL_SMTP_HOST, ''),
  EMAIL_SMTP_PORT: intFromEnv('EMAIL_SMTP_PORT', 587),
  EMAIL_SMTP_SECURE: bool(process.env.EMAIL_SMTP_SECURE),
  EMAIL_SMTP_USER: str(process.env.EMAIL_SMTP_USER, ''),
  EMAIL_SMTP_PASS: str(process.env.EMAIL_SMTP_PASS, ''),
  STRIPE_SECRET_KEY: str(process.env.STRIPE_SECRET_KEY, ''),
  STRIPE_WEBHOOK_SECRET: str(process.env.STRIPE_WEBHOOK_SECRET, ''),
  STRIPE_PUBLISHABLE_KEY: str(process.env.STRIPE_PUBLISHABLE_KEY, ''),
  STRIPE_PRICE_PRO: str(process.env.STRIPE_PRICE_PRO, ''),
  STRIPE_PRICE_ENTERPRISE: str(process.env.STRIPE_PRICE_ENTERPRISE, ''),
  MINIO_ENDPOINT: str(process.env.MINIO_ENDPOINT, ''),
  MINIO_PORT: intFromEnv('MINIO_PORT', 9000),
  MINIO_ACCESS_KEY: str(process.env.MINIO_ACCESS_KEY, ''),
  MINIO_SECRET_KEY: str(process.env.MINIO_SECRET_KEY, ''),
  MINIO_USE_SSL: bool(process.env.MINIO_USE_SSL),
  CDC_KAFKA_ENABLED: bool(process.env.CDC_KAFKA_ENABLED),
  KAFKA_BROKERS: str(process.env.KAFKA_BROKERS, 'localhost:9092'),
  KAFKA_TOPICS: str(
    process.env.KAFKA_TOPICS,
    'backtest.Run,backtest.BacktestSession,backtest.audit',
  ),
  KAFKA_GROUP_ID: str(process.env.KAFKA_GROUP_ID, 'backtest-outbox-consumer'),
};

type Config = typeof serverConfig &
  typeof engineConfig &
  typeof authConfig &
  typeof databaseConfig &
  typeof integrationsConfig;

export const config: Config = Object.assign(
  {},
  serverConfig,
  engineConfig,
  authConfig,
  databaseConfig,
  integrationsConfig,
);

assertNoDefaultSecrets(config as Record<string, unknown>);
