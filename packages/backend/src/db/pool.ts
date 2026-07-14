/**
 * PostgreSQL 连接池管理（单例）
 *
 * 企业理由（ADR-007）：连接池复用 TCP 连接，避免每次查询建立新连接的开销
 * （TLS 握手 + 认证约 50ms）。pg Pool 自动管理连接生命周期，
 * 空闲连接超时回收，连接错误自动重连。
 *
 * 权衡：连接池占用一定内存（每个连接约 10MB），但远优于
 * 每次请求新建连接的延迟开销。
 */

import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { registerPgPoolMetrics } from '../utils/metrics.js';

const { Pool } = pg;

/**
 * PostgreSQL 连接池（单例）
 *
 * 企业理由：连接池复用 TCP 连接，避免每次查询建立新连接的开销
 * （TLS 握手 + 认证约 50ms）。pg Pool 自动管理连接生命周期，
 * 空闲连接超时回收，连接错误自动重连。
 *
 * 权衡：连接池占用一定内存（每个连接约 10MB），但远优于
 * 每次请求新建连接的延迟开销。
 */
let pool: pg.Pool | null = null;

/**
 * PostgreSQL 只读副本连接池（单例）
 *
 * 企业理由：读写分离，读查询走副本减轻主库压力。
 * 未配置 DATABASE_READ_URL 时回退到主库连接池。
 */
let readPool: pg.Pool | null = null;

/**
 * 获取 PostgreSQL 连接池（单例）
 *
 * @returns pg.Pool 实例
 */
export function getPool(): pg.Pool {
  if (pool) return pool;

  logger.info('[db] PostgreSQL 连接池初始化开始');
  const t0 = Date.now();

  const databaseUrl = config.DATABASE_URL;

  pool = new Pool({
    connectionString: databaseUrl,
    max: config.DB_POOL_MAX,
    min: config.DB_POOL_MIN,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    // SSL 配置：生产环境强制 TLS
    ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
  });

  // 企业理由：statement_timeout 在每个新连接上设置查询超时，
  // 慢查询超时后 PostgreSQL 自动取消并释放连接，防止连接池耗尽。
  // pool.on('connect') 在每个新连接建立时触发，确保所有连接都有超时保护。
  // 权衡：10s 超时可能截断合法长查询，可使用 SET LOCAL 在事务级别覆盖。
  pool.on('connect', (client: pg.PoolClient) => {
    client.query(`SET statement_timeout = ${config.DB_STATEMENT_TIMEOUT_MS}`);
  });

  // 连接池错误处理（防止未捕获的连接错误导致进程崩溃）
  pool.on('error', (err: Error) => {
    logger.error({ err }, '[db] PostgreSQL 连接池发生未捕获错误');
  });

  logger.info({ durationMs: Date.now() - t0 }, '[db] PostgreSQL 连接池初始化完成');
  registerPgPoolMetrics('primary', () => ({
    waitingCount: pool!.waitingCount,
    totalCount: pool!.totalCount,
  }));
  return pool;
}

/**
 * 获取只读连接池（用于读查询）
 *
 * 企业理由：读写分离，读查询走副本减轻主库压力。
 * 未配置 DATABASE_READ_URL 时回退到主库连接池。
 */
export function getReadPool(): pg.Pool {
  if (readPool) return readPool;
  const readUrl = config.DATABASE_READ_URL;
  if (!readUrl) {
    // 未配置读副本，回退到主库
    return getPool();
  }
  logger.info('[db] PostgreSQL 只读连接池初始化开始');
  const t0 = Date.now();

  readPool = new Pool({
    connectionString: readUrl,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
  });

  readPool.on('error', (err: Error) => {
    logger.error({ err }, '[db] PostgreSQL 只读连接池发生未捕获错误');
  });

  readPool.on('connect', (client: pg.PoolClient) => {
    client.query(`SET statement_timeout = ${config.DB_STATEMENT_TIMEOUT_MS}`);
  });

  logger.info({ durationMs: Date.now() - t0 }, '[db] PostgreSQL 只读连接池初始化完成');
  registerPgPoolMetrics('read', () => ({
    waitingCount: readPool!.waitingCount,
    totalCount: readPool!.totalCount,
  }));
  return readPool;
}

/**
 * 获取数据库客户端（用于事务）
 *
 * 企业理由：事务需要独占连接，RELEASE 后归还连接池。
 * 使用方式：
 * ```ts
 * const client = await getClient();
 * try {
 *   await client.query('BEGIN');
 *   // ... 事务操作 ...
 *   await client.query('COMMIT');
 * } catch (err) {
 *   await client.query('ROLLBACK');
 *   throw err;
 * } finally {
 *   client.release();
 * }
 * ```
 */
export async function getClient(): Promise<pg.PoolClient> {
  const pool = getPool();
  return pool.connect();
}

/**
 * 关闭数据库连接池
 */
export async function closeDb(): Promise<void> {
  const t0 = Date.now();
  if (readPool) {
    await readPool.end();
    readPool = null;
    logger.info({ durationMs: Date.now() - t0 }, '[db] PostgreSQL 只读连接池已关闭');
  }
  if (pool) {
    await pool.end();
    pool = null;
    logger.info({ durationMs: Date.now() - t0 }, '[db] PostgreSQL 连接池已关闭');
  }
}
