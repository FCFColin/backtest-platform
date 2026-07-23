/**
 * 数据库与 Redis 配置片段。
 *
 * 涵盖 PostgreSQL 主库/只读副本连接、语句超时、连接池及同步回测超时。
 */

/** 数据库配置片段（ADR-007）。 */
export const databaseConfig = {
  /** PostgreSQL 连接 URL，生产环境须使用 TLS（?sslmode=require）。@default "postgresql://backtest:backtest@localhost:5432/backtest" */
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql://backtest:backtest@localhost:5432/backtest',

  /** PostgreSQL 只读副本连接 URL（读写分离），未配置时走主库。@default "" */
  DATABASE_READ_URL: process.env.DATABASE_READ_URL || '',

  /** PostgreSQL 查询语句超时（毫秒），超时自动取消查询并释放连接。@default 10000（10 秒） */
  DB_STATEMENT_TIMEOUT_MS: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '10000', 10),

  /** 同步回测端点超时（T-19），防止超大请求长时间占用连接。@default 120000 (2 分钟) */
  BACKTEST_SYNC_TIMEOUT_MS: parseInt(process.env.BACKTEST_SYNC_TIMEOUT_MS || '120000', 10),

  /** Redis 连接 URL（BullMQ 任务队列）。@default "redis://localhost:6379" */
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  /** PostgreSQL 连接池最大连接数。@default 20 */
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '20', 10),

  /** 连接池最小空闲连接（T-2 性能）。 */
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),
};
