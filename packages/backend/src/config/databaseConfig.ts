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

  /**
   * Redis 连接 URL（单实例回退，开发环境使用）。@default "redis://localhost:6379"
   *
   * 仅当 REDIS_SENTINELS 未设置时生效（ADR-045 向后兼容）。
   * 生产环境必须配置 REDIS_SENTINELS，单实例模式不提供高可用。
   */
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  /**
   * Redis Sentinel 节点列表（ADR-045 生产高可用）。
   *
   * 逗号分隔的 `host:port` 列表，例如：
   *   `redis-sentinel-0.redis-sentinel:26379,redis-sentinel-1.redis-sentinel:26379,redis-sentinel-2.redis-sentinel:26379`
   *
   * 设置后 ioredis 启用 Sentinel 模式，自动向 Sentinel 查询 master 地址。
   * 未设置时回退到 REDIS_URL 单实例模式（开发环境）。
   * @default ""（未设置 → 走 REDIS_URL）
   */
  REDIS_SENTINELS: process.env.REDIS_SENTINELS || '',

  /**
   * Redis Sentinel 监控的 master 名称（ADR-045）。
   *
   * 必须与 sentinel.conf 中 `sentinel monitor <name>` 一致。
   * @default "mymaster"
   */
  REDIS_SENTINEL_NAME: process.env.REDIS_SENTINEL_NAME || 'mymaster',

  /**
   * Redis 认证密码（可选，Sentinel 与单实例共用）。
   *
   * 生产环境应通过 Secret 注入。设置后同时用于 Redis 与 Sentinel 连接。
   * @default ""（无密码）
   */
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',

  /** PostgreSQL 连接池最大连接数。@default 20 */
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '20', 10),

  /** 连接池最小空闲连接（T-2 性能）。 */
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),
};
