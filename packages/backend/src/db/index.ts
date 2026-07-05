/**
 * PostgreSQL 数据库模块
 *
 * 企业理由（ADR-007）：SQLite 单文件限制阻塞水平扩展，
 * 多副本 K8s Deployment 无法共享 SQLite 文件。
 * PostgreSQL 提供连接池、流复制、ACID 事务、全文搜索，
 * 是企业级关系数据库标准，解除水平扩展阻塞。
 *
 * 权衡：
 * - 引入 PostgreSQL 运维依赖（需独立进程），但解除扩展阻塞
 * - 比 SQLite 多一层网络开销（本地连接 ~0.1ms，可忽略）
 * - 开发环境需本地 PostgreSQL（可通过 docker-compose 简化）
 *
 * 迁移路径（ADR-006 → ADR-007）：
 * SQLite → PostgreSQL，Schema 沿用 v1（tickers/prices/cpi_data/exchange_rates），
 * 增加 PostgreSQL 特有优化（tsvector 全文搜索、BRIN 索引）。
 *
 * 迁移文件提取（I-3）：
 * 内联 SQL 提取到 migrations/ 目录的独立 .sql 文件。
 * 企业理由：
 * - DBA 审查：独立文件可逐文件审批，内联 SQL 无法 git diff
 * - 版本控制 diff：SQL 变更在 PR 中一目了然
 * - CI 测试：up/down 文件可在 CI 中独立验证回滚
 * 权衡：需维护文件与代码的同步，但版本控制 diff 和 CI 测试收益更大。
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { registerPgPoolMetrics } from '../utils/metrics.js';

const { Pool } = pg;

// 企业理由（I-3）：migrations 目录相对于项目根目录。
// 使用 import.meta.url + 逐级上溯定位项目根，兼容 npm run dev 和 npm run build。
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../migrations');

// ---------------------------------------------------------------------------
// 连接池配置
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 租户上下文（RLS 强制点，ADR-032）
// ---------------------------------------------------------------------------

/** UUID v4 校验（防御性，set_config 已通过 $1 参数化避免注入） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 在租户上下文事务中执行回调（RLS 强制点，ADR-032）。
 *
 * 企业理由：多租户隔离的安全保证由 Postgres RLS 提供，而非靠每个查询都记得
 * 加 `WHERE tenant_id=`。本助手在事务内通过 `set_config('app.current_tenant_id', $1, true)`
 * （is_local=true，等价 SET LOCAL）注入当前租户，使 009 迁移定义的 RLS 策略生效。
 *
 * 关键纪律：
 * - 必须使用事务级（SET LOCAL / is_local=true）而非会话级设置，否则在 PgBouncer
 *   transaction-pooling 下连接复用会串租户。事务结束后该设置自动失效。
 * - 所有租户作用域的查询都应经由本助手获得的 client 执行；脱离本助手的查询因
 *   `app.current_tenant_id` 未设置而读到零行 / 写被拒绝（fail-safe）。
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
  if (!UUID_RE.test(tenantId)) {
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
// Schema 迁移管理
// ---------------------------------------------------------------------------

/**
 * 从 migrations/ 目录读取 SQL 文件内容
 *
 * 企业理由（I-3）：迁移 SQL 从内联字符串提取到独立文件，
 * 便于 DBA 审查、版本控制 diff、CI 回滚测试。
 *
 * @param filename - SQL 文件名（如 '001_init.sql'）
 * @returns SQL 文件内容
 */
function readMigrationFile(filename: string): string {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 迁移注册表
 *
 * 每个版本对应一对 up/down SQL 文件，版本号从 1 开始递增。
 * 新增 schema 变更时，只需在此表末尾追加新版本并在 migrations/ 目录添加对应 SQL 文件。
 *
 * 企业理由（I-3）：版本化迁移是数据库工程的基础（Flyway/Liquibase 标配），
 * 确保 schema 变更可追踪、可回滚、可审计。
 * 独立 SQL 文件比内联字符串更利于 DBA 审查和 CI 测试。
 * 权衡：迁移文件需手动维护与注册表的同步，但版本控制 diff 和 CI 测试收益更大。
 */
const migrations: Array<{
  version: number;
  description: string;
  upFile: string;
  downFile: string;
}> = [
  {
    version: 1,
    description: '初始 schema：tickers, prices, cpi_data, exchange_rates, schema_migrations',
    upFile: '001_init.sql',
    downFile: '001_init_down.sql',
  },
  {
    version: 2,
    description: '全文搜索：tickers 搜索向量 + GIN 索引',
    upFile: '002_fts.sql',
    downFile: '002_fts_down.sql',
  },
  {
    version: 3,
    description: '索引清理：删除冗余索引 + 添加 CHECK 约束',
    upFile: '003_index_cleanup.sql',
    downFile: '003_index_cleanup_down.sql',
  },
  {
    version: 4,
    description: '用户表：支持多用户注册、argon2id 密码哈希、角色分配',
    upFile: '004_users.sql',
    downFile: '004_users_down.sql',
  },
  {
    version: 5,
    description: 'Outbox表：事件与业务数据的事务一致性（Event Sourcing）',
    upFile: '005_outbox.sql',
    downFile: '005_outbox_down.sql',
  },
  {
    version: 6,
    description: 'Outbox 去重：event_id 唯一约束',
    upFile: '006_outbox_dedup.sql',
    downFile: '006_outbox_dedup_down.sql',
  },
  {
    version: 7,
    description: '最小权限 DB 角色 backtest_app',
    upFile: '007_least_privilege.sql',
    downFile: '007_least_privilege_down.sql',
  },
  {
    version: 8,
    description: 'CHECK 约束：价格/成交量/汇率合法性',
    upFile: '008_checks.sql',
    downFile: '008_checks_down.sql',
  },
  {
    version: 9,
    description: '多租户：organizations/memberships/api_keys + 租户数据表 + RLS（ADR-032）',
    upFile: '009_tenancy.sql',
    downFile: '009_tenancy_down.sql',
  },
  {
    version: 10,
    description: '自助注册与邀请：users.email + 邮箱验证令牌 + 组织邀请（ADR-035）',
    upFile: '010_user_email.sql',
    downFile: '010_user_email_down.sql',
  },
  {
    version: 11,
    description: 'Stripe 计费：stripe_customers + subscriptions（ADR-036）',
    upFile: '011_billing.sql',
    downFile: '011_billing_down.sql',
  },
  {
    version: 12,
    description: '用量计量与配额：usage_events + usage_counters + RLS（ADR-037）',
    upFile: '012_usage.sql',
    downFile: '012_usage_down.sql',
  },
];

/**
 * 初始化数据库 schema（执行未应用的迁移）
 *
 * 企业理由：每个迁移在独立事务中执行，失败自动回滚，
 * 避免部分应用导致数据库处于不一致状态。
 * 权衡：DDL 语句在 PostgreSQL 事务中是原子的（大多数情况），
 * 但大规模数据迁移可能长时间持锁，影响可用性。
 */
export async function initSchema(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  const t0 = Date.now();

  try {
    // 确保 schema_migrations 表存在
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        description TEXT
      );
    `);

    // 读取已应用的版本
    const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version');
    const appliedVersions = new Set(rows.map((r: { version: number }) => r.version));

    const pendingMigrations = migrations.filter((m) => !appliedVersions.has(m.version));

    if (pendingMigrations.length === 0) {
      const currentVersion = appliedVersions.size > 0 ? Math.max(...appliedVersions) : 0;
      logger.info({ currentVersion }, '[db] Schema 已是最新，无需迁移');
      return;
    }

    logger.info(
      {
        currentVersion: appliedVersions.size > 0 ? Math.max(...appliedVersions) : 0,
        targetVersion: migrations[migrations.length - 1].version,
      },
      '[db] Schema 迁移开始',
    );

    // 执行未应用的迁移
    for (const m of pendingMigrations) {
      logger.info({ version: m.version, description: m.description }, '[db] 执行迁移');

      try {
        await client.query('BEGIN');
        await client.query(readMigrationFile(m.upFile));
        await client.query('INSERT INTO schema_migrations (version, description) VALUES ($1, $2)', [
          m.version,
          m.description,
        ]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err, version: m.version }, `[db] Schema v${m.version} 迁移失败`);
        throw err; // 迁移失败应阻止启动
      }
    }

    logger.info(
      {
        fromVersion: appliedVersions.size > 0 ? Math.max(...appliedVersions) : 0,
        toVersion: migrations[migrations.length - 1].version,
        durationMs: Date.now() - t0,
      },
      '[db] Schema 迁移完成',
    );
  } finally {
    client.release();
  }
}

/**
 * 回滚指定版本的迁移
 *
 * 企业理由：生产迁移必须可回滚（ADR-007 FR-7.2）。
 * 回滚在独立事务中执行，失败自动回滚。
 *
 * @param targetVersion - 要回滚到的版本号
 */
export async function rollbackSchema(targetVersion: number): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // 获取已应用的迁移（降序排列）
    const { rows } = await client.query(
      'SELECT version FROM schema_migrations ORDER BY version DESC',
    );
    const appliedVersions = rows.map((r: { version: number }) => r.version);

    // 回滚高于目标版本的迁移
    const toRollback = migrations.filter(
      (m) => appliedVersions.includes(m.version) && m.version > targetVersion,
    );

    if (toRollback.length === 0) {
      logger.info({ targetVersion }, '[db] 无需回滚');
      return;
    }

    // 按版本降序回滚
    for (const m of toRollback.sort((a, b) => b.version - a.version)) {
      logger.info({ version: m.version, description: m.description }, '[db] 执行回滚');

      try {
        await client.query('BEGIN');
        await client.query(readMigrationFile(m.downFile));
        await client.query('DELETE FROM schema_migrations WHERE version = $1', [m.version]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err, version: m.version }, `[db] Schema v${m.version} 回滚失败`);
        throw err;
      }
    }

    logger.info({ targetVersion }, '[db] Schema 回滚完成');
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
