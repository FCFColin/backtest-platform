# ADR-002: 数据库从 SQLite 迁移至 PostgreSQL

| 状态 | 已接受 | 日期 | 2026-06-23 | 取代 | DADR-006 |

## Context

SQLite 单文件无法跨 Pod 共享（K8s 2 副本无法安全扩展），写入串行瓶颈，无连接池，缺企业级运维工具。ADR-003 Go 迁移需要 pgx 驱动。

## Decision

迁移到 PostgreSQL 16+，Go 用 pgx/v5，TypeScript 用 pg + node-postgres。

- 连接池：pgxpool（MaxConns=25）、pg Pool（max=20）
- Schema 沿用 SQLite v1，增加 tsvector+GIN 全文搜索、BRIN 时序索引
- 迁移管理：自研 SQL runner（node-postgres，db/migrations.ts），版本化 Up/Down SQL（migrations/）
- 数据导入：JSON → COPY 命令（比 INSERT 快 10-100 倍）
- 不选 MongoDB（关系模型更适合金融时序数据，需 ACID）
- 不选 SQLite+共享存储（NFS 上 WAL 不可靠）

## Consequences

- (+) 解除水平扩展阻塞，获得连接池/全文搜索/流复制/企业运维生态
- (-) 引入 PostgreSQL 运维依赖，开发环境需 docker-compose
- 后续：数据量 > 100GB 时考虑 TimescaleDB
