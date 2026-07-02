# ADR-007: 数据库从 SQLite 迁移至 PostgreSQL

> **企业理由**：SQLite 是单文件嵌入式数据库，无法支持多实例水平扩展、连接池共享和读副本。当系统需要从单实例演进到多副本 K8s 部署时，PostgreSQL 是企业级关系数据库的标准选择，提供 ACID 事务、连接池、流复制、全文搜索和成熟的运维生态。

| 字段   | 值                         |
| ------ | -------------------------- |
| 状态   | 已接受                     |
| 日期   | 2026-06-23                 |
| 决策者 | 架构组                     |
| 范围   | 数据层                     |
| 取代   | ADR-006（SQLite 迁移决策） |

## Context（背景和驱动力）

ADR-006 决定从 JSON 文件迁移到 SQLite（better-sqlite3），解决了 8000+ 文件的目录遍历性能问题和 JSON 非原子写的损坏风险。但 SQLite 存在以下架构限制：

1. **单实例限制**：SQLite 是单文件数据库，多副本 Deployment 无法共享同一数据库文件（K8s 中需要 ReadWriteMany 卷或外部数据库）。当前 `api-deployment.yaml:13` 配置 2 副本，但 SQLite 文件无法跨 Pod 访问，实际无法安全扩展。

2. **写入并发瓶颈**：SQLite WAL 模式下写入仍为串行（一次只允许一个写者），高并发写入场景（批量数据更新）性能受限。

3. **连接池缺失**：better-sqlite3 为同步 API，每个 Node.js 进程持有一个文件句柄，无法利用连接池优化。

4. **运维生态差距**：SQLite 缺乏企业级运维工具（流复制、点-in-time 恢复、监控仪表盘、托管服务），生产环境排障和备份依赖手动操作。

5. **语言精简协同**：ADR-008 决定将 Rust 引擎迁移到 Go，Go 生态中 PostgreSQL 驱动（pgx）成熟度远超 SQLite 驱动，且 Go 的 database/sql 接口天然支持连接池。

**当前状况**：

- `api/db/index.ts` 已实现 SQLite schema（tickers/prices/cpi_data/exchange_rates），但 dataService.ts 仍主要使用 JSON 文件。
- `api/db/import.ts` 提供 JSON→SQLite 导入工具。
- K8s 部署配置 2 副本但 SQLite 文件无法共享，水平扩展被阻塞。

## Decision（决策）

**将数据库从 SQLite 迁移到 PostgreSQL，使用 pgx 驱动（Go）和 pg（node-postgres）驱动（TypeScript）。**

具体方案：

1. **数据库引擎**：PostgreSQL 16+（支持 JSONB、全文搜索、流复制、LISTEN/NOTIFY）
2. **Go 驱动**：github.com/jackc/pgx/v5（纯 Go 实现，支持 pipeline、连接池、预编译语句）
3. **TypeScript 驱动**：pg（node-postgres）+ drizzle-orm（类型安全查询构建器）
4. **连接池**：
   - Go：pgxpool（MaxConns=25, MinConns=5, MaxConnIdleTime=5min, MaxConnLifetime=1h）
   - TypeScript：pg Pool（max=20, idleTimeoutMillis=30000, connectionTimeoutMillis=5000）
5. **Schema**：沿用 SQLite v1 schema（tickers/prices/cpi_data/exchange_rates），增加 PostgreSQL 特有优化：
   - `prices` 表按 `ticker` 范围分区（Range Partitioning，可选）
   - `tickers.search_vector` tsvector 列 + GIN 索引（全文搜索，替代当前线性扫描）
   - `prices` 表 BRIN 索引（按 date 列，时序数据压缩索引）
6. **迁移管理**：golang-migrate（Go）+ drizzle-kit（TypeScript），版本化 Up/Down SQL 文件
7. **数据导入**：从 JSON 文件批量导入，使用 COPY 命令（比 INSERT 快 10-100 倍）
8. **部署**：K8s StatefulSet + PVC（或云托管 RDS），ConfigMap/Secret 管理连接信息

**不选择 MongoDB 的理由**：

- 数据模型为高度结构化的金融时序数据（OHLCV + 元数据），关系模型更自然
- 需要复杂 JOIN（标的+价格+汇率联合查询）、事务（批量导入原子性）、外键约束
- PostgreSQL 的 JSONB 列可满足灵活 schema 需求，无需引入文档数据库
- 金融数据对 ACID 事务有硬性要求，PostgreSQL 的 MVCC 比 MongoDB 的文档级锁更适合

**不选择 SQLite + 外部共享存储的理由**：

- NFS/Ceph 等共享文件系统引入额外运维复杂度和性能损耗
- SQLite 在网络文件系统上 WAL 模式行为不可靠
- 直接使用 PostgreSQL 是更简洁的架构选择

## Consequences（后果）

**正面后果**：

- 解除水平扩展阻塞：多副本 Deployment 可共享同一 PostgreSQL 实例
- 获得连接池：pgxpool/pg Pool 复用连接，减少连接建立开销
- 获得全文搜索：tsvector + GIN 索引替代线性扫描，标的搜索性能从 O(n) 降为 O(log n)
- 获得流复制：可为读密集型场景配置读副本
- 获得企业级运维生态：pg_dump/pg_restore/点-in-time 恢复/PgBouncer/Grafana 监控
- 为 Go 引擎迁移铺路：pgx 是 Go 生态最成熟的 PostgreSQL 驱动

**负面后果**：

- 引入 PostgreSQL 运维依赖（需独立数据库进程，Docker/K8s 中需额外部署）
- 开发环境需本地 PostgreSQL（可通过 docker-compose 简化）
- 比 SQLite 多一层网络开销（本地连接 ~0.1ms，可忽略）
- 需维护数据库连接配置（DATABASE_URL、连接池参数）

**后续考虑**：

- 当数据量 > 100GB 或查询延迟 > 100ms 时，考虑引入 TimescaleDB（PostgreSQL 时序扩展）
- 当需要实时数据推送时，利用 PostgreSQL LISTEN/NOTIFY 通知数据更新
