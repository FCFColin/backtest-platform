import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { registerPgPoolMetrics } from '../utils/metrics.js';
import { isUuid } from '../utils/misc.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let readPool: pg.Pool | null = null;

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end().catch((err: Error) => logger.error({ err }, '[db] 主连接池关闭失败'));
    pool = null;
  }
  if (readPool) {
    await readPool.end().catch((err: Error) => logger.error({ err }, '[db] 只读连接池关闭失败'));
    readPool = null;
  }
}

interface CreatePoolOptions {
  connectionString: string;
  poolName: string;
  min?: number;
  keepAlive?: boolean;
}

function createAndInstrumentPool(opts: CreatePoolOptions): pg.Pool {
  logger.info(`[db] ${opts.poolName}初始化开始`);
  const t0 = Date.now();
  const poolConfig: pg.PoolConfig = {
    connectionString: opts.connectionString,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
  };
  if (opts.min !== undefined) poolConfig.min = opts.min;
  if (opts.keepAlive) {
    poolConfig.keepAlive = true;
    poolConfig.keepAliveInitialDelayMillis = 10000;
  }
  const newPool = new Pool(poolConfig);
  newPool.on('connect', (client: pg.PoolClient) => {
    client.query(`SET statement_timeout = ${config.DB_STATEMENT_TIMEOUT_MS}`);
  });
  newPool.on('error', (err: Error) => {
    logger.error({ err }, `[db] ${opts.poolName}发生未捕获错误`);
  });
  logger.info({ durationMs: Date.now() - t0 }, `[db] ${opts.poolName}初始化完成`);
  return newPool;
}

export function getPool(): pg.Pool {
  if (pool) return pool;
  pool = createAndInstrumentPool({
    connectionString: config.DATABASE_URL,
    poolName: 'PostgreSQL 连接池',
    min: config.DB_POOL_MIN,
    keepAlive: true,
  });
  registerPgPoolMetrics('primary', () => ({
    waitingCount: pool?.waitingCount ?? 0,
    totalCount: pool?.totalCount ?? 0,
  }));
  return pool;
}

export function getReadPool(): pg.Pool {
  if (readPool) return readPool;
  const readUrl = config.DATABASE_READ_URL;
  if (!readUrl) return getPool();
  readPool = createAndInstrumentPool({
    connectionString: readUrl,
    poolName: 'PostgreSQL 只读连接池',
  });
  registerPgPoolMetrics('read', () => ({
    waitingCount: readPool?.waitingCount ?? 0,
    totalCount: readPool?.totalCount ?? 0,
  }));
  return readPool;
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
  sourcePool: pg.Pool = getPool(),
): Promise<T> {
  const client = await sourcePool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, '[db] ROLLBACK 失败');
    }
    throw err;
  } finally {
    client.release();
  }
}

// RLS GUC 注入（ADR-009）：SET LOCAL 使 RLS 策略在事务内生效，提交后自动清除。
async function withGucContext<T>(
  gucs: Record<string, string>,
  fn: (client: pg.PoolClient) => Promise<T>,
  sourcePool: pg.Pool = getPool(),
): Promise<T> {
  return withTransaction(async (client) => {
    for (const [name, value] of Object.entries(gucs)) {
      await client.query('SELECT set_config($1, $2, true)', [name, value]);
    }
    return fn(client);
  }, sourcePool);
}

// 平台运维上下文：绕过租户隔离并扮演 admin（break-glass key、审计导出、Stripe webhook 等无租户路径）。
export function withPlatformContext<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  return withGucContext({ 'app.is_platform_admin': 'true', 'app.current_user_role': 'admin' }, fn);
}

async function withTenantContext<T>(
  tenantId: string,
  sourcePool: pg.Pool,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (!isUuid(tenantId)) {
    throw new Error(`withTenant: 非法 tenantId（需为 UUID）: ${tenantId}`);
  }
  return withGucContext({ 'app.current_tenant_id': tenantId }, fn, sourcePool);
}

export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTenantContext(tenantId, getPool(), fn);
}

export async function withTenantReadOnly<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return withTenantContext(tenantId, getReadPool(), fn);
}
