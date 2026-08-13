# ADR-015: 退役 data-fetcher 独立 worker CLI

| 状态 | 已接受 | 日期 | 2026-08-14 | 合并 | — | 关联 | ADR-003, ADR-012 |

## Context

`data-fetcher/cmd/worker`（1,243 行，`package main`）是与 HTTP 服务并行的独立 CLI 二进制，提供 `seed` / `fetch` / `update` / `fetch-universe` / `fetch-sim` 五个命令，内含自建 DB 连接池、ticker 宇宙构建器与 SIM 拼接（segment splice + expense-ratio 折算）逻辑。

全仓库审计显示其为零消费者子系统：

- **构建面**：`data-fetcher/Dockerfile` 只编译根包；Makefile、docker-compose.yml、scripts/、CI、docs/ 均无引用（`rg cmd/worker|data-fetcher-worker` 零命中）。
- **功能面**：更新作业已由 TS BullMQ worker（`packages/backend/queues/worker.ts`）接管；数据获取由 data-fetcher HTTP 服务（`data-fetcher/main.go`）承担。
- **SIM 数据**：CLI 内 `sim.go` 的拼接实现是平行的已淘汰实现——live 系统通过 `packages/backend/src/infrastructure/synthetic-tickers.json` 元数据 + `dataServices.ts`（`splice_by_return`）生成合成标的价格，不消费该 CLI。
- **不可引用性**：`package main` 无法被其他包导入。

## Decision

- 删除 `data-fetcher/cmd/worker/` 全部 8 个文件（main/commands/db/sim/universe_builder + 3 个测试）。
- 配套测试随子系统退役删除（被测功能即被删除代码，无迁移目标；与 ADR-012/013 同模式）。
- 删除门禁按决策原则执行：确认零生产消费者、无悬挂配置面；本 ADR 独立提交。

## Consequences

- (+) 移除被 TS 生态取代的死子系统与其重复 SIM 实现；消除"两套数据管道"误导。
- (-) 若未来需重建单机批量取数 CLI，以本 ADR 为基线重新实现（成本显式可见）。
