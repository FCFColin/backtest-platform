/**
 * 数据库与 Redis 配置片段。
 *
 * 涵盖 PostgreSQL 主库/只读副本连接、语句超时、连接池及同步回测超时。
 */

/**
 * 数据库配置片段（ADR-007）。
 */
export const databaseConfig = {
  /**
   * PostgreSQL 数据库连接 URL（ADR-007）。
   *
   * 企业理由：PostgreSQL 解除 SQLite 单实例限制，支持多副本 K8s 部署。
   * 连接 URL 包含主机/端口/数据库名/用户/密码，通过环境变量注入。
   * 生产环境必须使用 TLS 连接（postgresql://...?sslmode=require）。
   * 开发环境使用本地 PostgreSQL（可通过 docker-compose 启动）。
   * @default "postgresql://backtest:backtest@localhost:5432/backtest"
   */
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql://backtest:backtest@localhost:5432/backtest',

  /**
   * PostgreSQL 只读副本连接 URL（读写分离）。
   *
   * 企业理由：100x 流量下读查询走副本，减轻主库连接压力。
   * 读副本通过流复制同步，延迟通常 <100ms，适合回测数据读取。
   * 权衡：读副本有复制延迟，不适合强一致性读场景。
   * 未配置时所有查询走主库（DATABASE_URL）。
   * @default ""（未配置，所有查询走主库）
   */
  DATABASE_READ_URL: process.env.DATABASE_READ_URL || '',

  /**
   * PostgreSQL 查询语句超时时间（毫秒）。
   *
   * 企业理由：慢查询无超时会长期占用连接，20 连接池快速耗尽后全站降级。
   * statement_timeout 在 PostgreSQL 服务端执行，超时自动取消查询并释放连接。
   * 权衡：超时值需平衡正常查询耗时和连接保护。回测批量查询通常 <5s，
   * 10s 留有余量；如遇合法长查询可临时调高或使用 SET LOCAL 覆盖。
   * @default 10000（10 秒）
   */
  DB_STATEMENT_TIMEOUT_MS: parseInt(process.env.DB_STATEMENT_TIMEOUT_MS || '10000', 10),

  /**
   * 同步回测端点超时（T-19），防止超大请求长时间占用连接。
   * @default 120000 (2 分钟)
   */
  BACKTEST_SYNC_TIMEOUT_MS: parseInt(process.env.BACKTEST_SYNC_TIMEOUT_MS || '120000', 10),

  /**
   * Redis 连接 URL（BullMQ 任务队列）。
   *
   * Architecture: Redis连接配置，用于BullMQ任务队列
   * 企业为何需要：参数优化（1000组合）和网格搜索（200组合）同步执行阻塞事件循环30-100s
   * 权衡：引入Redis依赖，但异步化后P99从100s+降至<1s
   *
   * @default "redis://localhost:6379"
   */
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  /**
   * PostgreSQL 连接池最大连接数。
   *
   * 企业理由：连接池大小需与 PostgreSQL max_connections 协调，
   * 过大浪费资源，过小请求排队。默认 20 适合中等负载。
   * @default 20
   */
  DB_POOL_MAX: parseInt(process.env.DB_POOL_MAX || '20', 10),
  /** 连接池最小空闲连接（T-2 性能） */
  DB_POOL_MIN: parseInt(process.env.DB_POOL_MIN || '2', 10),
};
