# ADR-006: JSON 文件存储迁移至 SQLite

> **企业理由**：当数据规模超过文件系统的实际承载能力时，必须迁移到具备事务、索引、完整性约束的数据库。延迟迁移会导致性能持续劣化和数据损坏风险累积。本 ADR 记录迁移决策，取代 ADR-002 的"有条件接受 JSON 存储"决定。

| 字段     | 值                                                                          |
| -------- | --------------------------------------------------------------------------- |
| 状态     | 已取代（见 ADR-007）                                                        |
| 日期     | 2026-06-23                                                                  |
| 决策者   | 架构组                                                                      |
| 范围     | 数据层                                                                      |
| 取代     | ADR-002（JSON 文件存储）                                                    |
| 取代原因 | ADR-007 决定从 SQLite 进一步迁移至 PostgreSQL，解除单实例限制，支持水平扩展 |

## Context（背景和驱动力）

ADR-002 于 2025-01-15 决定采用 JSON 文件存储，并设定了 5 条迁移触发条件（`ADR-002:50-60`）：

1. 标的数量 > 5000 → 迁移 SQLite
2. 需要日期范围查询 → 迁移 SQLite
3. 多实例部署 → 迁移 PostgreSQL
4. 写入并发 > 1 → 迁移 SQLite
5. 单文件 > 50MB → 迁移 SQLite

**当前状况**：

- `data/market/tickers/` 目录已包含 8000+ JSON 文件（`api/db/index.ts:4` 注释确认"8000+ 文件已是文件系统临界点"），**已超过触发条件 1 的 5000 阈值**。
- 文件系统在 8000+ 文件时出现明显的目录遍历性能下降，`fs.readdirSync` 耗时随文件数线性增长。
- JSON 文件无事务保障：`dataService.ts:149` 的 `fs.writeFileSync` 非原子写，写入中断会导致文件损坏（`ADR-002:75-76` 自认此风险）。
- SQLite 迁移基础设施已就绪：`api/db/index.ts` 实现了 better-sqlite3 + WAL 模式 + 版本化 schema 迁移（`schema_migrations` 表），`api/db/import.ts` 实现了 JSON→SQLite 批量导入。

## Decision（决策）

**将数据读取路径从 JSON 文件迁移到 SQLite（better-sqlite3），JSON 文件保留为数据源和降级 fallback。**

具体方案：

1. **存储引擎**：better-sqlite3（同步 API，无需 Promise 开销，适合单实例读多写少场景）
2. **WAL 模式**：`journal_mode = WAL`（`db/index.ts:41`），读写不互斥
3. **Schema**：`tickers`（标的元数据）+ `prices`（OHLCV 行情，含 `UNIQUE(ticker, date)` 复合唯一约束）
4. **索引**：`idx_prices_ticker`、`idx_prices_ticker_date`（覆盖按标的 + 按日期范围查询）
5. **迁移管理**：版本化迁移注册表 + `schema_migrations` 表 + 幂等迁移（每个迁移在独立事务中执行）
6. **数据导入**：`db/import.ts` 提供从 JSON 文件批量导入的脚本
7. **降级**：SQLite 不可用时 fallback 到 JSON 文件读取（保持现有降级链设计）

**不选择 PostgreSQL 的理由**：

- 当前为单实例部署，无多副本需求
- SQLite 零运维（无需独立数据库进程），适合当前规模
- better-sqlite3 性能在单机读多写少场景优于 PostgreSQL（无网络开销）
- ADR-002 触发条件 3（多实例部署→PostgreSQL）尚未满足

## Consequences（后果）

**正面后果**：

- 获得事务保障（ACID），消除 JSON 非原子写的损坏风险
- 获得索引能力，日期范围查询从 O(n) 全表扫描降为 O(log n) 索引查找
- 获得外键约束和 CHECK 约束，数据完整性在 DB 层保障
- Schema 变更可通过迁移文件版本化管理（而非手动改 JSON）
- 为未来迁移 PostgreSQL 铺路（SQL 语法兼容）

**负面后果**：

- 增加 better-sqlite3 原生模块依赖（需编译，Docker 中需 build-essential）
- SQLite 单文件写入锁，高并发写入时性能下降（当前为读多写少，可接受）
- 多实例部署时 SQLite 文件无法共享（需迁移 PostgreSQL，见 ADR-002 触发条件 3）
- 需维护 JSON→SQLite 数据同步（导入脚本 + 增量更新）

**后续迁移触发条件**（从 SQLite 迁移到 PostgreSQL）：

- 需要多实例水平扩展（SQLite 文件无法跨 Pod 共享）
- 写入并发 > 50 QPS（SQLite WAL 模式写入瓶颈）
- 数据量 > 10GB（SQLite 单文件性能下降）

## 与 ADR-002 的关系

本 ADR **取代** ADR-002 的"有条件接受 JSON 存储"决定。ADR-002 中定义的迁移触发条件已被超越（标的 > 5000），按其预设路径迁移至 SQLite。ADR-002 标记为"已取代"。
