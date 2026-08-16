# ADR-018: 迁移改 forward-only，退役 rollbackSchema 与 down 迁移

| 状态 | 已接受 | 日期 | 2026-08-16 | 合并 | — | 关联 | ADR-002 |

## Context

DB 迁移自基线以来维护版本化 Up/Down SQL 与 `rollbackSchema(N)`（ADR-002），并配套 down 文件、CI UP/DOWN 配对校验（check-migrations）与文档化回滚承诺（security.md：迁移可回滚阻断控制、DB rollbackSchema <5min）。

对标行业实践（opencode 的 `up-migrations` 目录、drizzle/prisma 生成的迁移）均为 **forward-only**：仅保留 up SQL，schema 回滚不靠 down 迁移，而靠版本化备份/时间点恢复。down 迁移在实践中几乎不落地执行，且随 schema 演进极易与最新结构漂移（down 脚本基于历史结构编写，后续变更会使其失效），维护成本高、风险低效。

## Decision

- 迁移管理改为 forward-only：`db/migrations.ts` 仅保留 `initSchema`（advisory lock + 事务内逐版本 up SQL + schema_migrations 登记），删除 `rollbackSchema` 与 migrations 注册表的 `downFile` 字段。
- 删除 7 个 `NNN_*_down.sql` 文件（可经 git 历史追溯）。
- `check-migrations.mjs` 收敛为 up-only 校验（命名、序号连续、注册表一致），移除 UP/DOWN 配对检查。
- DB 回滚口径改为备份恢复：`scripts/backup-restore.sh`（WAL/全量，安全.md 已引用），删除「DB rollbackSchema <5min」承诺，security.md 阻断控制与 GB/T 22239 回滚自证改为备份恢复口径。
- 配套测试迁移：integration 删除两个 rollback 场景（v3→v2 回滚、down→up 循环），pool.test.ts 删除两个 rollbackSchema 单测；initSchema 正常路径与 CHECK 约束断言全部保留。
- 删除门禁已核：确认零生产消费者、无悬挂配置面（down 文件/脚本/文档同步收敛）、配套测试迁移、本 ADR 独立记录。

## Consequences

- (+) 消除与最新 schema 必然漂移的 down 迁移维护面；CI 校验更简；迁移路径单一（forward-only），符合行业标准与可审计性。
- (+) DB 回滚由备份恢复统一承载（更接近生产实情，down 迁移从未在生产执行过）。
- (-) 不再支持代码级 schema 降级；需回滚时改为备份恢复（依赖既有备份策略）。
