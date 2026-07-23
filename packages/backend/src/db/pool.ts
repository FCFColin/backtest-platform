/**
 * PostgreSQL 数据库模块（连接池 + 租户上下文 + Schema 迁移，ADR-007）。
 *
 * SQLite 单文件限制阻塞水平扩展，PostgreSQL 提供连接池/流复制/ACID/全文搜索，
 * 解除多副本 K8s Deployment 共享存储阻塞。迁移 SQL 提取到 migrations/ 独立文件
 * （I-3），便于 DBA 审查与 CI 回滚测试。本模块合并自原 db/index.ts + db/pool.ts。
 */

import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { registerPgPoolMetrics } from '../utils/metrics.js';
import { isUuid } from '../utils/validation.js';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// 连接池配置
// ---------------------------------------------------------------------------

/**
 * PostgreSQL 连接池（单例）。连接池复用 TCP 连接避免每次查询的 TLS 握手 + 认证
 * 开销（约 50ms），pg Pool 自动管理生命周期。权衡：占用内存（每连接 ~10MB）。
 */
let pool: pg.Pool | null = null;

/**
 * PostgreSQL 只读副本连接池（单例）。读写分离减轻主库压力，
 * 未配置 DATABASE_READ_URL 时回退到主库连接池。
 */
let readPool: pg.Pool | null = null;

interface CreatePoolOptions {
  connectionString: string;
  /** 连接池名称，用于日志（如 'PostgreSQL 连接池' 或 'PostgreSQL 只读连接池'） */
  poolName: string;
  /** 最小连接数（仅主库连接池配置） */
  min?: number;
  /** 启用 keepAlive（仅主库连接池启用） */
  keepAlive?: boolean;
}

/**
 * 创建并装配 PostgreSQL 连接池：统一 Pool 配置、statement_timeout、错误处理。
 *
 * 企业理由：getPool 与 getReadPool 此前各自重复 new Pool + on('connect') + on('error')
 * 约 20 行配置代码。提取为单一函数消除重复，保证两个连接池的行为一致。
 * 指标注册（registerPgPoolMetrics）保留在调用方，因其闭包需引用模块级 pool/readPool 变量。
 *
 * @param opts - 连接池配置
 * @returns 已装配事件处理器的 pg.Pool 实例
 */
function createAndInstrumentPool(opts: CreatePoolOptions): pg.Pool {
  logger.info(`[db] ${opts.poolName}初始化开始`);
  const t0 = Date.now();

  const poolConfig: pg.PoolConfig = {
    connectionString: opts.connectionString,
    max: config.DB_POOL_MAX,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // SSL 配置：生产环境强制 TLS
    ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
  };
  if (opts.min !== undefined) {
    poolConfig.min = opts.min;
  }
  if (opts.keepAlive) {
    poolConfig.keepAlive = true;
    poolConfig.keepAliveInitialDelayMillis = 10000;
  }

  const newPool = new Pool(poolConfig);

  // 企业理由：statement_timeout 在每个新连接上设置查询超时，
  // 慢查询超时后 PostgreSQL 自动取消并释放连接，防止连接池耗尽。
  // pool.on('connect') 在每个新连接建立时触发，确保所有连接都有超时保护。
  // 权衡：10s 超时可能截断合法长查询，可使用 SET LOCAL 在事务级别覆盖。
  newPool.on('connect', (client: pg.PoolClient) => {
    client.query(`SET statement_timeout = ${config.DB_STATEMENT_TIMEOUT_MS}`);
  });

  // 连接池错误处理（防止未捕获的连接错误导致进程崩溃）
  newPool.on('error', (err: Error) => {
    logger.error({ err }, `[db] ${opts.poolName}发生未捕获错误`);
  });

  logger.info({ durationMs: Date.now() - t0 }, `[db] ${opts.poolName}初始化完成`);
  return newPool;
}

/**
 * 获取 PostgreSQL 连接池（单例）
 *
 * @returns pg.Pool 实例
 */
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

/** 获取只读连接池（读写分离，未配置 DATABASE_READ_URL 时回退到主库） */
export function getReadPool(): pg.Pool {
  if (readPool) return readPool;
  const readUrl = config.DATABASE_READ_URL;
  if (!readUrl) {
    // 未配置读副本，回退到主库
    return getPool();
  }

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

// ---------------------------------------------------------------------------
// 租户上下文（RLS 强制点，ADR-032）
// ---------------------------------------------------------------------------

/**
 * 在租户上下文事务中执行回调（RLS 强制点，ADR-032）。
 *
 * 通过 SET LOCAL 注入 tenant_id 使 RLS 策略生效；必须用事务级而非会话级，
 * 否则 PgBouncer transaction-pooling 下连接复用会串租户。
 *
 * @typeParam T - 回调返回类型
 * @param tenantId - 当前租户（组织）UUID
 * @param fn - 接收已设置租户上下文的事务 client 的回调
 * @returns 回调结果
 * @throws 当 tenantId 非法 UUID，或回调/事务失败（自动 ROLLBACK）时
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (!isUuid(tenantId)) {
    throw new Error(`withTenant: 非法 tenantId（需为 UUID）: ${tenantId}`);
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 事务级设置（is_local=true）：随 COMMIT/ROLLBACK 自动复位，PgBouncer 安全
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr }, '[db] withTenant ROLLBACK 失败');
    }
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// 连接管理
// ---------------------------------------------------------------------------

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

/**
 * 健康检查：验证数据库连接是否正常
 *
 * @returns 连接是否正常
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT 1');
    return result.rowCount === 1;
  } catch {
    return false;
  }
}
